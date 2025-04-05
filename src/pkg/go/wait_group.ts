/**
 * ErrorGroup is a collection of goroutines working on subtasks that are part of the same overall task.
 * ErrorGroup 是一组协程，它们处理同一个总体任务的子任务集合。
 */
export class ErrorGroup {
    /**
     * The internal WaitGroup for synchronization
     * 内部用于同步的 WaitGroup
     */
    private wg: WaitGroup = new WaitGroup();

    /**
     * Stores the first error encountered
     * 存储遇到的第一个错误
     */
    private err: Error | null = null;

    /**
     * Lock to protect access to the error variable
     * 保护错误变量访问的锁
     */
    private errLock: boolean = false;

    /**
     * Semaphore for limiting concurrent executions
     * 用于限制并发执行数的信号量
     */
    private activeTasks: number = 0;
    private maxConcurrency: number | null = null;
    private taskQueue: Array<() => Promise<void>> = [];

    /**
     * Creates a new ErrorGroup with optional concurrency limit
     * 创建一个新的 ErrorGroup，可选择设置并发限制
     * @param limit - Maximum number of concurrent tasks (null means no limit)
     */
    constructor(limit: number | null = null) {
        if (limit !== null && limit <= 0) {
            throw new Error('Limit must be positive');
        }
        this.maxConcurrency = limit;
    }

    /**
     * Executes a function in a new goroutine and captures any error it returns.
     * 在新的协程中执行函数并捕获它返回的任何错误。
     * @param fn - The function to execute, which can return an Error or a Promise that resolves to an Error
     */
    Go(fn: () => Error | null | Promise<Error | null>): void {
        this.wg.add(1);
        
        const task = async () => {
            try {
                const err = await fn();
                if (err) {
                    this.setError(err);
                }
            } catch (e) {
                this.setError(e instanceof Error ? e : new Error(String(e)));
            } finally {
                this.wg.done();
                this.activeTasks--;
                this.scheduleNext();
            }
        };

        if (this.maxConcurrency === null || this.activeTasks < this.maxConcurrency) {
            // If under the limit or no limit, execute immediately
            // 如果未达到限制或无限制，立即执行
            this.activeTasks++;
            task();
        } else {
            // Queue the task for later execution
            // 将任务加入队列以便稍后执行
            this.taskQueue.push(task);
        }
    }

    /**
     * Schedules the next task from the queue if available
     * 如果队列中有任务，则调度下一个任务
     */
    private scheduleNext(): void {
        if (this.taskQueue.length > 0 && 
            (this.maxConcurrency === null || this.activeTasks < this.maxConcurrency)) {
            this.activeTasks++;
            const nextTask = this.taskQueue.shift()!;
            nextTask();
        }
    }

    /**
     * Waits for all goroutines to complete and returns the first error encountered.
     * 等待所有协程完成并返回遇到的第一个错误。
     * @returns A promise that resolves when all tasks are done, or rejects with the first error
     */
    async wait(): Promise<void> {
        await this.wg.wait();
        if (this.err) {
            throw this.err;
        }
    }

    /**
     * Sets the error if no error has been set yet.
     * 如果尚未设置错误，则设置错误。
     * @param err - The error to set
     */
    private setError(err: Error): void {
        if (this.errLock) return;
        
        this.errLock = true;
        if (!this.err) {
            this.err = err;
        }
        this.errLock = false;
    }
}

/**
 * WaitGroup is a synchronization primitive that allows to wait for a collection of goroutines to finish.
 * WaitGroup 是一种同步原语，允许等待一组协程完成。
 */
class WaitGroup {
    /**
     * The counter of unfinished tasks
     * 未完成任务的计数器
     */
    private counter: number = 0;

    /**
     * Promise and its resolver for waiting
     * 用于等待的 Promise 及其解析器
     */
    private resolver: (() => void) | null = null;
    private promise: Promise<void> | null = null;

    /**
     * Adds delta to the WaitGroup counter.
     * 向 WaitGroup 计数器添加 delta。
     * @param delta - The number to add to the counter (default: 1)
     */
    add(delta: number = 1): void {
        if (delta < 0 && Math.abs(delta) > this.counter) {
            throw new Error('Negative delta would result in negative counter');
        }
        
        this.counter += delta;
        
        if (this.counter === 0 && this.resolver) {
            this.resolver();
            this.resolver = null;
            this.promise = null;
        }
    }

    /**
     * Decrements the WaitGroup counter by one.
     * 将 WaitGroup 计数器减一。
     */
    done(): void {
        this.add(-1);
    }

    /**
     * Blocks until the WaitGroup counter is zero.
     * 阻塞直到 WaitGroup 计数器为零。
     * @returns A promise that resolves when the counter reaches zero
     */
    async wait(): Promise<void> {
        if (this.counter === 0) {
            return Promise.resolve();
        }

        if (!this.promise) {
            this.promise = new Promise<void>((resolve) => {
                this.resolver = resolve;
            });
        }

        return this.promise;
    }

    /**
     * Returns the current value of the counter.
     * 返回计数器的当前值。
     */
    getCounter(): number {
        return this.counter;
    }
}