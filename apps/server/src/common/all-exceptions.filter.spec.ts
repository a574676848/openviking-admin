import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  const reply = jest.fn();
  const setHeader = jest.fn();
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: {
          'x-request-id': 'request-1',
        },
        url: '/api/knowledge/search',
      }),
      getResponse: () => ({
        getHeader: jest.fn(),
        setHeader: jest.fn(),
      }),
    }),
  } as unknown as ArgumentsHost;

  const filter = new AllExceptionsFilter({
    httpAdapter: {
      getRequestUrl: jest.fn(() => '/api/knowledge/search'),
      setHeader,
      reply,
    },
  } as unknown as HttpAdapterHost);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should map http errors to unified envelope', () => {
    filter.catch(
      new BadRequestException({
        code: 'CAPABILITY_INVALID_INPUT',
        message: '参数错误',
      }),
      host,
    );

    expect(setHeader).toHaveBeenCalledWith(expect.anything(), 'x-request-id', 'request-1');
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: null,
        error: expect.objectContaining({
          code: 'CAPABILITY_INVALID_INPUT',
          message: '参数错误',
          statusCode: HttpStatus.BAD_REQUEST,
        }),
        meta: expect.objectContaining({
          requestId: 'request-1',
          path: '/api/knowledge/search',
        }),
      }),
      HttpStatus.BAD_REQUEST,
    );
  });
});
