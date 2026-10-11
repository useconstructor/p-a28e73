'use client';
import { useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
export const Dialog = DialogPrimitive.Root;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
export function DialogContent({ children, className }: { children: React.ReactNode; className?: string }) {
  const previousFocus = useRef<HTMLElement | null>(typeof document !== 'undefined' ? document.activeElement as HTMLElement : null);
  return <DialogPrimitive.Portal><DialogPrimitive.Overlay className="dialog-overlay fixed inset-0 z-50 bg-ink/45 backdrop-blur-[2px]" /><DialogPrimitive.Content onCloseAutoFocus={e => { e.preventDefault(); previousFocus.current?.focus(); }} className={cn('dialog-content fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-paper p-6 shadow-xl sm:p-8', className)}>{children}<DialogPrimitive.Close aria-label="Cerrar personalización" className="absolute top-3 right-3 flex size-11 items-center justify-center rounded-full hover:bg-aluminum"><X size={20} /></DialogPrimitive.Close></DialogPrimitive.Content></DialogPrimitive.Portal>;
}
