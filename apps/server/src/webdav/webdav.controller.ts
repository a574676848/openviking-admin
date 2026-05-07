import {
  All,
  Controller,
  Param,
  Req,
  Res,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Readable } from 'node:stream';
import { WebdavService } from './webdav.service';

@Controller({ path: 'webdav', version: VERSION_NEUTRAL })
export class WebdavController {
  constructor(private readonly webdavService: WebdavService) {}

  @All(':tenantId')
  async handleTenantRoot(
    @Param('tenantId') tenantId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.webdavService.buildResponse(req, tenantId);
    this.sendResult(res, result);
  }

  @All(':tenantId/*resourcePath')
  async handleTenantResource(
    @Param('tenantId') tenantId: string,
    @Param('resourcePath') resourcePath: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.webdavService.buildResponse(
      req,
      tenantId,
      resourcePath,
    );
    this.sendResult(res, result);
  }

  private sendResult(
    res: Response,
    result: {
      status: number;
      headers: Record<string, string>;
      body: string | Readable;
    },
  ) {
    this.applyResult(res, result);
    if (this.isReadableBody(result.body)) {
      result.body.pipe(res);
      return;
    }
    res.send(result.body);
  }

  private applyResult(
    res: Response,
    result: { status: number; headers: Record<string, string> },
  ) {
    for (const [key, value] of Object.entries(result.headers)) {
      res.setHeader(key, value);
    }

    res.status(result.status);
  }

  private isReadableBody(body: string | Readable): body is Readable {
    return typeof body !== 'string';
  }
}
