import { NextRequest } from 'next/server';
import { handle } from '@/lib/server';
export const runtime = 'nodejs';
export const GET = (req: NextRequest) => handle(req, 'menu');
