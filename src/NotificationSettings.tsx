import { useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Bell, GraduationCap, Mail, CalendarClock } from "lucide-react";
import { Button } from "@/components/motion/button";
import { Switch } from "@/components/motion/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/motion/select";
import { SettingsGroup } from "./SettingsGroups";
import { usePreferences } from "./preferences";
import { useFeedback } from "./ui";
import { withCampusSession } from "./service";
import type { Account, Preferences } from "./types";

async function permission() {
  if (!isTauri()) throw Error("请在桌面应用中设置系统通知");
  const api = await import("@tauri-apps/plugin-notification");
  if (
    !(await api.isPermissionGranted()) &&
    (await api.requestPermission()) !== "granted"
  )
    throw Error("请在系统设置中允许知行发送通知");
}
export default function NotificationSettings({
  account,
}: {
  account?: Account;
}) {
  const { preferences, save } = usePreferences();
  const feedback = useFeedback(),
    [busy, setBusy] = useState(false);
  const enabled = !!account && !account.demo && isTauri();
  const own = preferences.reminderAccount === account?.id;
  async function run(task: () => Promise<void>) {
    setBusy(true);
    try {
      await task();
    } catch (error) {
      feedback(String(error), "error");
    } finally {
      setBusy(false);
    }
  }
  async function toggle(
    field: "gradeNotifications" | "courseNotifications",
    checked: boolean,
  ) {
    await run(async () => {
      if (checked) await permission();
      await save({
        ...preferences,
        [field]: checked,
        reminderAccount: account?.id || "",
      });
    });
  }
  const update = (next: Partial<Preferences>) =>
    void run(() => save({ ...preferences, ...next }));
  return (
    <SettingsGroup
      id="notifications"
      title="通知与提醒"
      description="在应用运行期间检查更新；退出应用后停止。首次同步只建立记录，不提醒历史邮件或成绩。"
    >
      <div className="setting-row">
        <span>
          <strong>
            <Mail size={15} /> 新邮件
          </strong>
          <small>
            {account?.name || "请先连接校园账号"} · 检查新增未读邮件
          </small>
        </span>
        <Switch
          ariaLabel="新邮件通知"
          disabled={!enabled || busy}
          checked={
            preferences.mailNotifications &&
            preferences.mailAccount === account?.id
          }
          onCheckedChange={(checked) =>
            void run(async () => {
              if (checked) {
                await permission();
                await withCampusSession(account!.id, () =>
                  invoke("prime_mail_baseline", { username: account!.id }),
                );
              }
              await save({
                ...preferences,
                mailNotifications: checked,
                mailAccount: account?.id || "",
              });
            })
          }
        />
      </div>
      <div className="setting-row">
        <span>
          <strong>邮件检查间隔</strong>
          <small>后台检查收件箱，不改变邮件已读状态</small>
        </span>
        <Select
          value={String(preferences.mailInterval)}
          onValueChange={(value) => update({ mailInterval: Number(value) })}
        >
          <SelectTrigger aria-label="邮件检查间隔" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 5, 10, 15, 30, 60].map((value) => (
              <SelectItem key={value} value={String(value)}>
                {value} 分钟
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="setting-row">
        <span>
          <strong>
            <GraduationCap size={15} /> 新成绩
          </strong>
          <small>每 10 分钟检查；同步成绩时也提醒新增成绩与分数变化</small>
        </span>
        <Switch
          ariaLabel="新成绩通知"
          disabled={!enabled || busy}
          checked={preferences.gradeNotifications && own}
          onCheckedChange={(checked) =>
            void toggle("gradeNotifications", checked)
          }
        />
      </div>
      <div className="setting-row">
        <span>
          <strong>
            <CalendarClock size={15} /> 上课提醒
          </strong>
          <small>按已同步课表、教学周和单双周提醒，显示课程与教室</small>
        </span>
        <Switch
          ariaLabel="上课提醒"
          disabled={!enabled || busy}
          checked={preferences.courseNotifications && own}
          onCheckedChange={(checked) =>
            void toggle("courseNotifications", checked)
          }
        />
      </div>
      <div className="setting-row">
        <span>
          <strong>提醒时间</strong>
          <small>校园课表按北京时间执行；修改课表后请同步</small>
        </span>
        <Select
          value={String(preferences.courseReminderMinutes)}
          onValueChange={(value) =>
            update({ courseReminderMinutes: Number(value) })
          }
        >
          <SelectTrigger aria-label="上课提醒时间" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[0, 5, 10, 15, 30].map((value) => (
              <SelectItem key={value} value={String(value)}>
                {value ? `提前 ${value} 分钟` : "上课时"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <section className="notification-test-section">
        <strong>
          <Bell size={15} /> 检查系统通知
        </strong>
        <p className="settings-group-description">
          点击后在系统通知中心查看。若未出现，请在系统设置 → 通知中允许知行；专注模式和屏幕共享可能隐藏提醒。
        </p>
        <div className="flex gap-2 flex-wrap">
          {[
            ["mail", "测试邮件提醒"],
            ["grade", "测试成绩提醒"],
            ["course", "测试上课提醒"],
          ].map(([kind, label]) => (
            <Button
              key={kind}
              size="sm"
              variant="secondary"
              disabled={busy || !isTauri()}
              onClick={() =>
                void run(async () => {
                  await permission();
                  await invoke("test_notification", { kind });
                  feedback("通知已提交系统，请查看通知中心", "success");
                })
              }
            >
              {label}
            </Button>
          ))}
        </div>
      </section>
    </SettingsGroup>
  );
}
