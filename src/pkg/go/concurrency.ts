/**
 * Runs a function in a separate "goroutine" (asynchronous task).
 * 在单独的"协程"（异步任务）中运行函数。
 *
 * @param fn - The function to execute asynchronously
 */
export function go(fn: () => void | Promise<void>): void {
    // Schedule the function to run asynchronously using microtask queue for better performance
    // 使用微任务队列安排函数异步运行，以获得更好的性能
    Promise.resolve().then(() => fn());
}
