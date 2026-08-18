export const PAGE_SIZES = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export type PaginationInput = {
  page?: string | string[];
  pageSize?: string | string[];
};

export type Pagination = {
  page: number;
  pageSize: PageSize;
  limit: number;
  offset: number;
};

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: PageSize;
  totalPages: number;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parsePagination(input: PaginationInput = {}, defaultPageSize: PageSize = 25): Pagination {
  const parsedPage = Number.parseInt(first(input.page) ?? "1", 10);
  const parsedPageSize = Number.parseInt(first(input.pageSize) ?? String(defaultPageSize), 10);
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const pageSize = PAGE_SIZES.includes(parsedPageSize as PageSize) ? (parsedPageSize as PageSize) : defaultPageSize;
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}

export function paginatedResult<T>(items: T[], total: number, pagination: Pagination): PaginatedResult<T> {
  const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize));
  return {
    items,
    total,
    page: Math.min(pagination.page, totalPages),
    pageSize: pagination.pageSize,
    totalPages,
  };
}
