import type {
  CatalogAttribute,
  CatalogCategory,
  CatalogProduct,
  CatalogProductSummary,
  CatalogResolution,
} from './schemas.js';

export interface CatalogProductQuery {
  page: number;
  perPage: number;
  search?: string;
  category?: string;
  orderBy?: 'id' | 'title' | 'date' | 'modified' | 'price' | 'popularity';
  order?: 'asc' | 'desc';
  stockStatus?: Array<'instock' | 'outofstock' | 'onbackorder'>;
  featured?: boolean;
  onSale?: boolean;
  minPrice?: number;
  maxPrice?: number;
}

export interface CatalogPage<T> {
  items: T[];
  total: number;
}

export interface CatalogRepository {
  listProducts(query: CatalogProductQuery): Promise<CatalogPage<CatalogProductSummary>>;
  getProduct(code: string): Promise<CatalogProduct | null>;
  resolve(url: URL): Promise<CatalogResolution | null>;
  listCategories(page: number, perPage: number): Promise<CatalogPage<CatalogCategory>>;
  listAttributes(page: number, perPage: number): Promise<CatalogPage<CatalogAttribute>>;
}
