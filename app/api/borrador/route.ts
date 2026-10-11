import { NextRequest } from 'next/server';
import { handle } from '@/lib/server';
export const runtime = 'nodejs';
export const GET = (req: NextRequest) => handle(req, 'draft');
export const PATCH = (req: NextRequest) => handle(req, 'patch');
