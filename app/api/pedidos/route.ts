import { NextRequest } from 'next/server';
import { handle } from '@/lib/server';
export const runtime = 'nodejs';
export const POST = (req: NextRequest) => handle(req, 'order');
