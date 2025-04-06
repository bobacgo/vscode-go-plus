import { ErrorGroup } from "./wait_group";

export class sync {

    /**
       const group = new ErrorGroup(2); // Limit to 2 concurrent tasks
        
        for (let i = 1; i <= 5; i++) {
            const taskId = i;
            group.Go(async () => {
                console.log(`Task ${taskId} started`);
                await time.sleep(1000 * taskId);
                console.log(`Task ${taskId} completed after ${taskId} seconds`);
                return null; // No error
            });
        }
        
        await group.wait();
     */
    public static ErrorGroup(limit: number | null = null): ErrorGroup {
        return new ErrorGroup(limit);
    }
}