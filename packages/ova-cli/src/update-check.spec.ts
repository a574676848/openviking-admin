const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockWriteFileSync = jest.fn();
const mockMkdirSync = jest.fn();

const UPDATE_CHECK_PATH = "C:\\Users\\tester\\.ova_cli\\update-check.json";

jest.mock("fs", () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
}));

jest.mock("os", () => ({
  homedir: () => "C:\\Users\\tester",
}));

const { notifyCliUpdateIfAvailable } = require("./update-check") as typeof import("./update-check");

describe("update check", () => {
  const stdoutWrite = jest
    .spyOn(process.stdout, "write")
    .mockImplementation(() => true);
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      OVA_CLI_UPDATE_CHECK: "1",
    };
    mockExistsSync.mockReturnValue(false);
    global.fetch = jest.fn().mockResolvedValue(
      createJsonResponse({ version: "0.1.15" }),
    ) as unknown as typeof fetch;
  });

  afterAll(() => {
    process.env = originalEnv;
    stdoutWrite.mockRestore();
  });

  it("发现新版本时应写入检查缓存并提示更新命令", async () => {
    await notifyCliUpdateIfAvailable(
      { name: "@openviking-admin/ova-cli", version: "0.1.14" },
      {},
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://registry.npmjs.org/@openviking-admin%2Fova-cli/latest",
      expect.anything(),
    );
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      UPDATE_CHECK_PATH,
      expect.stringContaining('"latestVersion": "0.1.15"'),
      "utf8",
    );
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining("npm update -g @openviking-admin/ova-cli"),
    );
  });

  it("json 输出模式不应检查更新", async () => {
    await notifyCliUpdateIfAvailable(
      { name: "@openviking-admin/ova-cli", version: "0.1.14" },
      { output: "json" },
    );

    expect(global.fetch).not.toHaveBeenCalled();
    expect(stdoutWrite).not.toHaveBeenCalled();
  });

  it("未到检查间隔时不应请求 registry", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ checkedAt: new Date().toISOString(), latestVersion: "0.1.15" }),
    );

    await notifyCliUpdateIfAvailable(
      { name: "@openviking-admin/ova-cli", version: "0.1.14" },
      {},
    );

    expect(global.fetch).not.toHaveBeenCalled();
    expect(stdoutWrite).not.toHaveBeenCalled();
  });
});

function createJsonResponse(payload: Record<string, unknown>, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(payload),
  };
}
