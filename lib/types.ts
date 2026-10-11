export type Option = { id: string; group: string; label: string; price: number; available: boolean; required: boolean };
export type Product = { id: string; categoryId: string; name: string; description: string; price: number; available: boolean; image: string | null; options: Option[] };
export type Category = { id: string; name: string };
export type Line = { id: string; productId: string; quantity: number; note: string; optionIds: string[]; name: string; unitPrice: number; personalization: string[]; available: boolean };
export type Draft = { lines: Line[]; revision: number; name: string; note: string; reviewRequired: boolean; total: number };
export type Order = { id: string; name: string; note: string; total: number; status: string; createdAt: string; lines: { id: string; name: string; quantity: number; unitPrice: number; personalization: string[]; note: string }[] };
export const money = (cents: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(cents / 100);
