import { AuthController } from './auth.controller';
import type { AuthenticatedRequest } from '../common/authenticated-request.interface';
import { AuthService } from './auth.service';
import { SSOPortalService } from './sso/sso-portal.service';
import { SsoTicketService } from './sso/sso-ticket.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<Pick<AuthService, 'switchRole'>>;

  beforeEach(() => {
    authService = {
      switchRole: jest.fn(),
    };

    controller = new AuthController(
      authService as unknown as AuthService,
      {} as SSOPortalService,
      {} as SsoTicketService,
    );
  });

  it('应该把当前超管用户 ID 和目标租户 ID 传给 AuthService.switchRole', async () => {
    const expectedResult = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresInSeconds: 7200,
      refreshExpiresInSeconds: 604800,
      tenantName: 'OpenViking 记忆',
    };
    const req = {
      user: {
        id: 'admin-1',
      },
    } as AuthenticatedRequest;

    authService.switchRole.mockResolvedValue(expectedResult);

    await expect(controller.switchRole('tenant-1', req)).resolves.toEqual(
      expectedResult,
    );
    expect(authService.switchRole).toHaveBeenCalledWith('admin-1', 'tenant-1');
  });
});
