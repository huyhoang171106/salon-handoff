import { api } from './api';
import { useLoad } from './util';
import type { Employee, Product, Service } from './types';

/** Danh mục dùng chung giữa nhiều màn hình. */
export function useServices(all = false) {
  return useLoad(() => api<Service[]>('/services', { query: all ? { all: true } : undefined }), [all]);
}

export function useEmployees(enabled = true) {
  return useLoad(() => (enabled ? api<Employee[]>('/employees') : Promise.resolve([] as Employee[])), [enabled]);
}

export function useProducts(kind?: 'RETAIL' | 'MATERIAL') {
  return useLoad(() => api<Product[]>('/inventory/products', { query: { kind } }), [kind]);
}

export const isStylist = (e: Employee) => e.position === 'STYLIST' && e.status === 'ACTIVE';
export const isAssistant = (e: Employee) => e.position === 'ASSISTANT' && e.status === 'ACTIVE';
