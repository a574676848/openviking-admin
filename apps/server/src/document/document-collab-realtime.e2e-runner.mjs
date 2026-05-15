import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Hocuspocus } from '@hocuspocus/server';
import { HocuspocusProvider } from '@hocuspocus/provider';
import createNodeAdapter from 'crossws/adapters/node';
import * as Y from 'yjs';

const LOCALHOST_ADDRESS = '127.0.0.1';
const REALTIME_DOCUMENT_NAME = 'document:tenant-a:node-realtime';
const REALTIME_TEXT_NAME = 's9-realtime-text';
const REALTIME_TEXT_VALUE = 'S9 实时协作写入';
const REALTIME_OPERATOR_TOKEN = 'operator-token';
const REALTIME_AWARENESS_USER = {
  name: '协作者甲',
  color: 'var(--collab-cursor-1)',
};
const WAIT_TIMEOUT_MS = 10_000;
const WAIT_INTERVAL_MS = 25;
const WEBSOCKET_NORMAL_CLOSE_CODE = 1000;
const HOCUSPOCUS_TEST_TIMEOUT_MS = 10_000;
const NOT_FOUND_UPGRADE_RESPONSE =
  'HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n';
const SUCCESS_MARKER = 'P4_S9_REALTIME_OK';

class DocumentCollabRealtimeModule {}
Module({})(DocumentCollabRealtimeModule);

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

function isCollabRequestPath(path, collabPath) {
  return path === collabPath || path.startsWith(`${collabPath}/`);
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
    if (!isCollabRequestPath(resolveRequestPath(request), collabPath)) {
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

async function waitFor(condition, label) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < WAIT_TIMEOUT_MS) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
  }
  throw new Error(`${label} 超时。`);
}

function hasRemoteAwarenessUser(provider, userName) {
  return Array.from(provider.awareness.getStates().values()).some(
    (state) => state?.user?.name === userName,
  );
}

function createProvider(serverUrl, documentName, doc) {
  return new HocuspocusProvider({
    url: serverUrl,
    name: documentName,
    document: doc,
    token: REALTIME_OPERATOR_TOKEN,
    WebSocketPolyfill: WebSocket,
    delay: WAIT_INTERVAL_MS,
    initialDelay: 0,
    minDelay: WAIT_INTERVAL_MS,
    maxDelay: WAIT_INTERVAL_MS,
    messageReconnectTimeout: WAIT_TIMEOUT_MS,
  });
}

async function main() {
  const collabPath = readCollabPath();
  let upgradeCount = 0;
  let app;
  let adapter;
  let hocuspocus;
  let providerA;
  let providerB;
  const docA = new Y.Doc();
  const docB = new Y.Doc();

  try {
    hocuspocus = new Hocuspocus({
      quiet: true,
      timeout: HOCUSPOCUS_TEST_TIMEOUT_MS,
      onUpgrade: async () => {
        upgradeCount += 1;
      },
    });
    adapter = createCrosswsHocuspocusAdapter(hocuspocus);

    app = await NestFactory.create(DocumentCollabRealtimeModule, {
      logger: false,
    });
    const httpServer = app.getHttpServer();
    mountHocuspocusUpgrade(httpServer, hocuspocus, adapter, collabPath);
    await app.listen(0, LOCALHOST_ADDRESS);

    const port = getListeningPort(httpServer);
    const serverUrl = `ws://${LOCALHOST_ADDRESS}:${port}${collabPath}`;
    providerA = createProvider(serverUrl, REALTIME_DOCUMENT_NAME, docA);
    providerB = createProvider(serverUrl, REALTIME_DOCUMENT_NAME, docB);

    await waitFor(
      () => providerA.synced && providerB.synced,
      '协作客户端连接',
    );

    docA.getText(REALTIME_TEXT_NAME).insert(0, REALTIME_TEXT_VALUE);
    providerA.awareness.setLocalStateField('user', REALTIME_AWARENESS_USER);

    await waitFor(
      () => docB.getText(REALTIME_TEXT_NAME).toString() === REALTIME_TEXT_VALUE,
      '协作内容同步',
    );
    await waitFor(
      () => hasRemoteAwarenessUser(providerB, REALTIME_AWARENESS_USER.name),
      '协作者状态同步',
    );

    if (upgradeCount !== 2) {
      throw new Error(`onUpgrade 触发次数异常：${upgradeCount}`);
    }
    if (providerA.configuration.name !== REALTIME_DOCUMENT_NAME) {
      throw new Error(
        `HocuspocusProvider 文档名异常：${providerA.configuration.name}`,
      );
    }

    process.stdout.write(
      `${SUCCESS_MARKER} upgrades=${upgradeCount} name=${REALTIME_DOCUMENT_NAME} url=${serverUrl}\n`,
    );
  } finally {
    providerA?.disconnect();
    providerB?.disconnect();
    providerA?.destroy();
    providerB?.destroy();
    docA.destroy();
    docB.destroy();
    adapter?.closeAll(
      WEBSOCKET_NORMAL_CLOSE_CODE,
      'realtime e2e complete',
      false,
    );
    hocuspocus?.closeConnections();
    hocuspocus?.flushPendingStores();
    await app?.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
