export class time {

    /**
     * Pauses execution for the specified duration.
     * 暂停执行指定的时间。
     * 
     * await time.sleep(1000); // Sleep for 1 second
     * 
     * @param ms - Time to sleep in milliseconds
     * @returns A promise that resolves after the specified time
     */
    public static sleep(ms: number): Promise<void> {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }
    public static now(): Date {
        return new Date();
    }
}