import { ErrorAlert } from "./ui";
import { Input } from "@/components/motion/input";
import { Checkbox } from "@/components/motion/checkbox";
// 参考来源：用户提供的《校园网设备管理器》HTML（已粘贴的文本.txt）。
// 借鉴 online_list/logout 接口及设备选择、循环操作交互；当前账号校验、原生请求、取消与进度由本项目实现。
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/motion/button";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { LogOut, RefreshCw, Wifi } from "lucide-react";
import { Empty, Modal } from "./ui";
import { usePreferences } from "./preferences";
import { withCampusSession } from "./service";
import type { Account } from "./types";
type Device = {
  id: string;
  name: string;
  ip: string;
  mac: string;
  since: string;
  state: string;
};
type Job = {
  accountId: string;
  jobId: string;
  completed: number;
  total: number;
  device: Device | null;
  message: string;
  state: string;
};
export default function DeviceManager({
  account,
  refreshKey,
}: {
  account: Account;
  refreshKey?: string;
}) {
  const { preferences } = usePreferences();
  const [rows, setRows] = useState<Device[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [rounds, setRounds] = useState(1),
    [ip, setIp] = useState(""),
    [confirmation, setConfirmation] = useState<Device[] | null>(null),
    [progress, setProgress] = useState<Job | null>(null),
    [logs, setLogs] = useState<{ time: string; message: string }[]>([]),
    [running, setRunning] = useState(false);
  const job = useRef(""),
    active = useRef(false);
  function log(message: string) {
    setLogs((v) =>
      [
        {
          time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
          message,
        },
        ...v,
      ].slice(0, 100),
    );
  }
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const values: Device[] = account.demo
        ? [
            {
              id: "demo-laptop",
              name: "我的电脑",
              ip: "10.0.0.10",
              mac: "AA:BB:CC:00:00:10",
              since: "今天 09:00",
              state: "online",
            },
            {
              id: "demo-phone",
              name: "我的手机",
              ip: "10.0.0.11",
              mac: "AA:BB:CC:00:00:11",
              since: "今天 10:30",
              state: "online",
            },
          ]
        : await withCampusSession(account.id, () =>
            invoke("network_devices", { username: account.id }),
          );
      setRows(values);
      setSelected([]);
      log(`已读取 ${values.length} 台在线设备`);
    } catch (e) {
      setError(String(e));
      log(`查询失败：${String(e)}`);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, [account.id, refreshKey]);
  useEffect(() => {
    if (!isTauri()) return;
    let mounted = true;
    const off = listen<Job>("campus-device-job", ({ payload }) => {
      if (
        !mounted ||
        payload.accountId !== account.id ||
        payload.jobId !== job.current
      )
        return;
      setProgress(payload);
      log(
        payload.message +
          (payload.device
            ? ` · ${payload.device.name} ${payload.device.ip}`
            : ""),
      );
      if (payload.device)
        setRows((prev) =>
          prev.map((d) =>
            d.id === payload.device!.id
              ? {
                  ...d,
                  state: payload.state === "success" ? "offline" : "failed",
                }
              : d,
          ),
        );
      if (["finished", "stopped", "failed"].includes(payload.state)) {
        setRunning(false);
        active.current = false;
      }
    });
    return () => {
      mounted = false;
      void off.then((stop) => stop());
      if (active.current)
        void invoke("cancel_device_job", { jobId: job.current });
    };
  }, [account.id]);
  function confirm(devices: Device[]) {
    setError("");
    if (!devices.length) {
      setError("请先选择设备");
      return;
    }
    setConfirmation(devices);
  }
  async function start() {
    if (!confirmation) return;
    setError("");
    if (account.demo) {
      setError("演示账户可查看界面，真实设备下线请连接校园账号。");
      setConfirmation(null);
      return;
    }
    job.current = crypto.randomUUID();
    active.current = true;
    setRunning(true);
    setProgress({
      accountId: account.id,
      jobId: job.current,
      completed: 0,
      total: confirmation.length * rounds,
      device: null,
      message: "正在下线所选设备",
      state: "running",
    });
    const values = confirmation;
    setConfirmation(null);
    try {
      await withCampusSession(account.id, () =>
        invoke("logout_network_devices", {
          username: account.id,
          deviceIds: values.map((d) => d.id),
          rounds,
          jobId: job.current,
        }),
      );
    } catch (e) {
      setError(String(e));
      setRunning(false);
      active.current = false;
      log(String(e));
    }
  }
  return (
    <section className="surface device-manager">
      <div className="device-heading">
        <div>
          <Wifi size={21} />
          <h2>校园网在线设备</h2>
          <span>{account.studentId} · 当前账号</span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={loading || running}
          onClick={refresh}
        >
          <RefreshCw size={14} className={loading ? "spin" : ""} />
          刷新设备
        </Button>
      </div>
      <p className="setting-foot">
        连接校园网后可查询设备。下线会中断所选设备的网络连接；返回其他页面时停止尚未完成的批量操作。
      </p>
      {preferences.networkReconnect && (
        <p className="setting-foot">
          自动重连已开启，当前设备下线后可能自动恢复连接。
        </p>
      )}
      <div className="device-controls">
        <label>
          <Checkbox
            aria-label="全选在线设备"
            disabled={running || !rows.length}
            checked={
              !!rows.length && rows.every((d) => selected.includes(d.id))
            }
            onCheckedChange={(e) => setSelected(e ? rows.map((d) => d.id) : [])}
          />
          全选
        </label>
        <span />
        <label>
          循环次数
          <Input
            aria-label="设备下线循环次数"
            type="number"
            min="1"
            max="100"
            value={String(rounds)}
            disabled={running}
            onChange={(e) =>
              setRounds(Math.max(1, Math.min(100, Number(e) || 1)))
            }
          />
        </label>
        <Button
          size="sm"
          disabled={running || !selected.length}
          onClick={() => confirm(rows.filter((d) => selected.includes(d.id)))}
        >
          <LogOut size={14} />
          下线选中设备
        </Button>
      </div>
      {loading && !rows.length ? (
        <p className="quiet-empty">正在查询校园网设备…</p>
      ) : rows.length ? (
        <div className="device-table-wrap">
          <table className="device-table">
            <thead>
              <tr>
                <th />
                <th>设备名称</th>
                <th>IP / MAC 地址</th>
                <th>登录时间</th>
                <th>状态</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Checkbox
                      aria-label={`选择设备 ${d.name}`}
                      checked={selected.includes(d.id)}
                      disabled={running}
                      onCheckedChange={(e) =>
                        setSelected((v) =>
                          e ? [...v, d.id] : v.filter((id) => id !== d.id),
                        )
                      }
                    />
                  </td>
                  <td>{d.name}</td>
                  <td>
                    {d.ip}
                    <small>{d.mac || "未提供 MAC"}</small>
                  </td>
                  <td>{d.since || "—"}</td>
                  <td>
                    <span
                      className={`soft-tag ${d.state === "offline" ? "teal" : d.state === "failed" ? "rose" : "blue"}`}
                    >
                      {d.state === "offline"
                        ? "已下线"
                        : d.state === "failed"
                          ? "下线失败"
                          : "在线"}
                    </span>
                  </td>
                  <td>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={running || d.state === "offline"}
                      onClick={() => confirm([d])}
                    >
                      下线
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && (
          <Empty title="暂无在线设备" detail="连接校园网后刷新设备列表。" />
        )
      )}
      <form
        className="device-ip-form"
        onSubmit={(e) => {
          e.preventDefault();
          const device = rows.find((d) => d.ip === ip.trim());
          if (!device) {
            setError("请填写当前列表中的设备 IP，或先刷新设备列表。");
            return;
          }
          confirm([device]);
        }}
      >
        <Input
          aria-label="按 IP 选择本人设备"
          placeholder="输入当前列表中的 IP"
          value={String(ip)}
          onChange={(e) => setIp(e)}
          disabled={running}
        />
        <Button type="submit" size="sm" variant="secondary" disabled={running}>
          按 IP 下线
        </Button>
      </form>
      {progress && (
        <div className="device-job-progress">
          <div>
            <span>{progress.message}</span>
            <strong>
              {progress.completed} / {progress.total}
            </strong>
            {running && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  invoke("cancel_device_job", { jobId: job.current })
                }
              >
                停止操作
              </Button>
            )}
          </div>
          <progress max={progress.total} value={progress.completed} />
        </div>
      )}
      {error && <ErrorAlert message={String(error)} />}
      <div className="device-logs">
        <h3>操作日志</h3>
        {logs.length ? (
          logs.map((v, i) => (
            <p key={`${v.time}-${i}`}>
              <time>{v.time}</time>
              {v.message}
            </p>
          ))
        ) : (
          <p>查询与下线结果会显示在这里。</p>
        )}
      </div>
      {confirmation && (
        <Modal
          title="确认下线设备"
          subtitle="仅处理当前账号列表中选中的设备"
          onClose={() => setConfirmation(null)}
        >
          <ul className="device-confirm-list">
            {confirmation.map((d) => (
              <li key={d.id}>
                <strong>{d.name}</strong>
                <span>{d.ip}</span>
              </li>
            ))}
          </ul>
          <p className="setting-foot">
            将执行 {rounds} 轮下线操作，所选设备可能需要重新认证才能上网。
          </p>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setConfirmation(null)}>
              取消
            </Button>
            <Button onClick={start}>确认下线</Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
