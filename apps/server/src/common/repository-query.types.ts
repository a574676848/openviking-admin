export type RepositoryScalar = string | number | boolean | Date;

export type RepositoryWhere<T> = Partial<Record<keyof T, RepositoryScalar | RepositoryScalar[]>>;

export type RepositoryOrder<T> = Partial<Record<keyof T, 'ASC' | 'DESC'>>;

export interface RepositoryFindQuery<T> {
  where?: RepositoryWhere<T>;
  order?: RepositoryOrder<T>;
  take?: number;
  skip?: number;
}

export interface RepositoryFindOneQuery<T> {
  where: RepositoryWhere<T>;
}
