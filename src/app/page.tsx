'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const Home = () => {
    const router = useRouter();

    useEffect(() => {
        router.replace('/dashboard');
    }, [router]);

    return (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
            <p className="text-muted-foreground text-sm">Redirecting to dashboard...</p>
        </div>
    );
};

export default Home;
