export interface UserModel {
  id: string;
  username: string;
  passwordHash: string;
  role: string;
  tenantId: string | null;
  active: boolean;
  ssoId: string | null;
  provider: string | null;
  createdAt: Date;
  updatedAt: Date;
}
