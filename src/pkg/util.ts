/**
 * 防抖动函数，限制函数调用频率
 * Debounce function to limit function call frequency
 * 
 * @param func 要执行的函数 / Function to execute
 * @param wait 等待时间（毫秒） / Wait time (milliseconds)
 * @returns 防抖动后的函数 / Debounced function
 */
export function debounce(func: Function, wait: number): (...args: any[]) => void {
    let timeout: NodeJS.Timeout | null = null;

    return (...args: any[]) => {
        const later = () => {
            timeout = null;
            func(...args);
        };

        if (timeout) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(later, wait);
    };
}