export function limiter(most) {
    let running = 0;
    const queue = [];
    return async (work) => {
        if (running < most)
            running++;
        else
            await new Promise((go) => queue.push(go));
        try {
            return await work();
        }
        finally {
            const next = queue.shift();
            if (next)
                next();
            else
                running--;
        }
    };
}
