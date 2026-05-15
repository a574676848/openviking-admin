import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Hocuspocus } from '@hocuspocus/server';
import createNodeAdapter from 'crossws/adapters/node';

const LOCALHOST_ADDRESS = '127.0.0.1';
const SPIKE_DOCUMENT_NAME = 'document:tenant:node';
const WEBSOCKET_OPEN_TIMEOUT_MS = 5_000;
const WEBSOCKET_CLOSE_TIMEOUT_MS = 1_000;
const WEBSOCKET_NORMAL_CLOSE_CODE = 1000;
const HOCUSPOCUS_TEST_TIMEOUT_MS = 5_000;
const NOT_FOUND_UPGRADE_RESPONSE =
  'HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n';
const SUCCESS_MARKER = 'P3-0_OK';

class DocumentCollabSpikeModule {}
Module({})(DocumentCollabSpikeModule);

function readCollabPath() {
  const [, , collabPath] = process.argv;
  if (!collabPath?.startsWith('/')) {
    throw new Error('缺少有效的协作 WebSocket 路径参数。');
  }
  return collabPath;
}

function resolveRequestPath(request) {
  const host = request.headers.host ?? `${LOCALHOST_ADDRESS}:0`;
  const requestUrl = new URL(request.url ?? '/', `http://${host}`);
  return requestUrl.pathname;
}

function rejectUpgrade(socket) {
  socket.write(NOT_FOUND_UPGRADE_RESPONSE);
  socket.destroy();
}

function createCrosswsHocuspocusAdapter(hocuspocus) {
  return createNodeAdapter({
    hooks: {
      open(peer) {
        peer.hocuspocusConnection = hocuspocus.handleConnection(
          peer.websocket,
          peer.request,
        );
      },
      message(peer, message) {
        peer.hocuspocusConnection?.handleMessage(message.uint8Array());
      },
      close(peer, event) {
        peer.hocuspocusConnection?.handleClose({
          code: event.code,
          reason: event.reason,
        });
      },
      error(_peer, error) {
        throw error;
      },
    },
  });
}

function mountHocuspocusUpgrade(httpServer, hocuspocus, adapter, collabPath) {
  httpServer.on('upgrade', async (request, socket, head) => {
    if (resolveRequestPath(request) !== collabPath) {
      rejectUpgrade(socket);
      return;
    }

    await hocuspocus.hooks('onUpgrade', {
      request,
      socket,
      head,
      instance: hocuspocus,
    });
    await adapter.handleUpgrade(request, socket, head);
  });
}

function getListeningPort(httpServer) {
  const address = httpServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('Nest HTTP server 未返回可用监听端口。');
  }
  return address.port;
}

async function openWebSocket(url) {
  return new Promise((resolve, reject) => {
    const client = new WebSocket(url);
    const timeout = setTimeout(() => {
      client.close();
      reject(new Error(`WebSocket 握手超时：${url}`));
    }, WEBSOCKET_OPEN_TIMEOUT_MS);

    client.addEventListener(
      'open',
      () => {
        clearTimeout(timeout);
        resolve(client);
      },
      { once: true },
    );
    client.addEventListener(
      'error',
      () => {
        clearTimeout(timeout);
        reject(new Error(`WebSocket 握手失败：${url}`));
      },
      { once: true },
    );
  });
}

async function closeWebSocket(client) {
  if (client.readyState === WebSocket.CLOSED) {
    return;
  }

  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, WEBSOCKET_CLOSE_TIMEOUT_MS);
    client.addEventListener(
      'close',
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
    client.close(WEBSOCKET_NORMAL_CLOSE_CODE, 'spike complete');
  });
}

async function main() {
  const collabPath = readCollabPath();
  let upgradeCount = 0;
  let app;
  let client;
  const hocuspocus = new Hocuspocus({
    quiet: true,
    timeout: HOCUSPOCUS_TEST_TIMEOUT_MS,
    onUpgrade: async () => {
      upgradeCount += 1;
    },
  });
  const adapter = createCrosswsHocuspocusAdapter(hocuspocus);

  try {
    app = await NestFactory.create(DocumentCollabSpikeModule, {
      logger: false,
    });
    const httpServer = app.getHttpServer();
    mountHocuspocusUpgrade(httpServer, hocuspocus, adapter, collabPath);
    await app.listen(0, LOCALHOST_ADDRESS);

    const port = getListeningPort(httpServer);
    client = await openWebSocket(
      `ws://${LOCALHOST_ADDRESS}:${port}${collabPath}?name=${encodeURIComponent(
        SPIKE_DOCUMENT_NAME,
      )}`,
    );

    if (upgradeCount !== 1) {
      throw new Error(`onUpgrade 触发次数异常：${upgradeCount}`);
    }
    if (hocuspocus.server) {
      throw new Error('Hocuspocus 不应创建独立 HTTP server。');
    }

    process.stdout.write(`${SUCCESS_MARKER} port=${port}\n`);
  } finally {
    if (client) {
      await closeWebSocket(client);
    }
    adapter.closeAll(WEBSOCKET_NORMAL_CLOSE_CODE, 'spike complete', false);
    hocuspocus.closeConnections();
    hocuspocus.flushPendingStores();
    await app?.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
