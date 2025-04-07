import { Logger } from './logger';

const logger = Logger.withContext('RequestQueue');

/**
 * 请求队列配置接口
 * Request queue configuration interface
 */
interface RequestQueueOptions {
    // 每秒最大请求数
    // Maximum requests per second
    requestsPerSecond?: number;
}

/**
 * 通用的请求队列类，用于限制并发请求数量
 * Generic request queue class for limiting concurrent requests
 */
export class RequestQueue {
    // 请求队列
    // Request queue
    private queue: Array<() => Promise<any>> = [];

    // 当前正在进行的请求数
    // Number of currently ongoing requests
    private ongoingRequests = 0;

    // 队列处理中标志
    // Queue processing flag
    private isProcessingQueue = false;

    // 请求时间戳记录
    // Request timestamp records
    private requestTimestamps: number[] = [];

    // 每秒最大请求数
    // Maximum requests per second
    private requestsPerSecond = 0;

    /**
     * 创建一个请求队列
     * Create a request queue
     *
     * @param maxConcurrent 最大并发请求数 / Maximum concurrent requests
     * @param options 队列选项 / Queue options
     */
    constructor(
        private maxConcurrent: number = 3,
        options?: RequestQueueOptions
    ) {
        if (maxConcurrent <= 0) {
            throw new Error('最大并发请求数必须为正数 / Maximum concurrent requests must be positive');
        }

        if (options?.requestsPerSecond) {
            this.requestsPerSecond = options.requestsPerSecond;
            logger.debug(`已设置每秒最大请求数: ${this.requestsPerSecond} / Set maximum requests per second`);
        }
    }

    /**
     * 将任务添加到队列
     * Add task to queue
     *
     * @param task 要执行的任务 / Task to execute
     * @returns 任务执行结果的Promise / Promise of task execution result
     */
    public async enqueue<T>(task: () => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            // 将任务包装成一个异步函数
            // Wrap the task as an async function
            const wrappedTask = async () => {
                try {
                    // 等待并发数降低到限制以下
                    // Wait for concurrent count to drop below limit
                    while (this.ongoingRequests >= this.maxConcurrent) {
                        await new Promise(r => setTimeout(r, 100)); // 轮询等待 / Poll wait
                    }

                    // 如果启用了速率限制，则需要在执行前等待
                    // If rate limiting is enabled, wait before execution
                    if (this.requestsPerSecond > 0) {
                        await this.waitForRateLimit();
                    }

                    this.ongoingRequests++;

                    // 如果启用了速率限制，记录请求时间戳
                    // If rate limiting is enabled, record request timestamp
                    if (this.requestsPerSecond > 0) {
                        this.recordRequest();
                    }

                    const result = await task();
                    resolve(result);
                    return result;
                } catch (error) {
                    reject(error);
                    throw error;
                } finally {
                    this.ongoingRequests--;
                    this.processQueue(); // 处理队列中的下一个任务 / Process next task in queue
                }
            };

            // 添加到队列
            // Add to queue
            this.queue.push(wrappedTask);

            // 如果队列没有在处理中，开始处理
            // Start processing if the queue is not being processed
            if (!this.isProcessingQueue) {
                this.processQueue();
            }
        });
    }

    /**
     * 记录请求时间戳
     * Record request timestamp
     */
    private recordRequest(): void {
        const now = Date.now();
        this.requestTimestamps.push(now);

        // 清理超过1秒的时间戳
        // Clean up timestamps older than 1 second
        const oneSecondAgo = now - 1000;
        this.requestTimestamps = this.requestTimestamps.filter(timestamp => timestamp > oneSecondAgo);
    }

    /**
     * 等待速率限制
     * Wait for rate limit
     */
    private async waitForRateLimit(): Promise<void> {
        if (this.requestsPerSecond <= 0) return;

        const now = Date.now();
        const oneSecondAgo = now - 1000;

        // 清理超过1秒的时间戳
        // Clean up timestamps older than 1 second
        this.requestTimestamps = this.requestTimestamps.filter(timestamp => timestamp > oneSecondAgo);

        // 如果最近1秒内的请求数已经达到或接近限制，则等待
        // If the number of requests in the last second is reaching the limit, wait
        const safetyBuffer = 1; // 安全缓冲值，确保不超过限制 / Safety buffer to ensure we don't exceed the limit
        if (this.requestTimestamps.length >= (this.requestsPerSecond - safetyBuffer)) {
            // 强制等待直到下一个可用时间槽
            // Force wait until next available time slot
            const minWaitTime = 1000 / this.requestsPerSecond; // 最小等待时间 / Minimum wait time

            let waitTime = 0;
            if (this.requestTimestamps.length > 0) {
                // 计算需要等待的时间：最早的时间戳 + 1000毫秒 - 当前时间
                // Calculate how long to wait: earliest timestamp + 1000ms - current time
                waitTime = Math.max(this.requestTimestamps[0] + 1000 - now, minWaitTime);
            } else {
                waitTime = minWaitTime;
            }

            logger.debug(`速率限制：等待 ${waitTime}ms 确保不超过每秒${this.requestsPerSecond}个请求 / 
                         Rate limit: waiting ${waitTime}ms to ensure not exceeding ${this.requestsPerSecond} requests per second`);

            if (waitTime > 0) {
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }

            // 在等待之后再次检查和清理时间戳，确保状态是最新的
            // Check and clean timestamps again after waiting to ensure state is up-to-date
            const newNow = Date.now();
            this.requestTimestamps = this.requestTimestamps.filter(timestamp => timestamp > (newNow - 1000));
        }
    }

    /**
     * 处理队列
     * Process queue
     */
    private async processQueue(): Promise<void> {
        // 如果没有任务或已达到最大并发数，返回
        // Return if there are no tasks or maximum concurrency is reached
        if (this.queue.length === 0 || this.ongoingRequests >= this.maxConcurrent) {
            return;
        }

        // 标记为正在处理
        // Mark as processing
        this.isProcessingQueue = true;

        // 循环处理队列中的任务，加入间隔确保不超过速率限制
        // Process tasks in the queue in a loop, adding intervals to ensure rate limits are not exceeded
        while (this.queue.length > 0 && this.ongoingRequests < this.maxConcurrent) {
            const task = this.queue.shift();
            if (task) {
                // 不等待任务完成，让它们并行执行
                // Don't await task completion, let them run in parallel
                task().catch(error => {
                    logger.error('队列中的任务失败 / Task in queue failed:', error);
                });

                // 如果启用了速率限制且队列中还有任务，添加小延迟来确保请求间隔
                // If rate limiting is enabled and there are more tasks, add a small delay to ensure request spacing
                if (this.requestsPerSecond > 0 && this.queue.length > 0) {
                    const minSpacing = Math.floor(1000 / this.requestsPerSecond);
                    await new Promise(resolve => setTimeout(resolve, minSpacing));
                }
            }
        }

        // 如果队列为空，标记为未处理
        // Mark as not processing if the queue is empty
        if (this.queue.length === 0) {
            this.isProcessingQueue = false;
        }
    }

    /**
     * 获取当前队列长度
     * Get current queue length
     */
    public get length(): number {
        return this.queue.length;
    }

    /**
     * 获取当前正在进行的请求数
     * Get number of ongoing requests
     */
    public get activeCount(): number {
        return this.ongoingRequests;
    }

    /**
     * 清空队列
     * Clear queue
     */
    public clear(): void {
        this.queue = [];
    }
}
