import { useErrorState } from "./ui";
import { useFeedback } from "./ui";
import { Card, CardContent } from "@/components/motion/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
// 参考来源：余额字段参考 MIS 状态接口，充值入口参考原版首页；界面与入口管理由本项目实现。
// https://github.com/HFDLYS/BJTUselfService/blob/7d94f740efa99152456f5a2e72bb0948de4a2e7a/app/src/main/java/team/bjtuss/bjtuselfservice/web/MisDataManager.java
// https://github.com/HFDLYS/BJTUselfService/blob/7d94f740efa99152456f5a2e72bb0948de4a2e7a/app/src/main/java/team/bjtuss/bjtuselfservice/screen/HomeScreen.kt
// https://github.com/fish2lab/bjtu-cli/blob/8a39d48d326ac195360c3564c9576d8a067aad03/Sources/bjtu/Services/MISService.swift
import { useEffect, useState } from "react";
import { Button } from "@/components/motion/button";
import { invoke } from "@tauri-apps/api/core";
import { ExternalLink, Link, Wallet, Wifi } from "lucide-react";
import type { Account, CampusData } from "./types";
import { PageHeading } from "./Pages";
import { copyText } from "./learning";
import DeviceManager from "./DeviceManager";
import { openSchoolPage, ManualCaptchaRequired } from "./service";
export default function Services({
  account,
  data,
  onRefresh,
  onLoginRequired,
  onDeviceView,
}: {
  account: Account;
  data: CampusData;
  onRefresh: () => Promise<void>;
  onLoginRequired?: () => void;
  onDeviceView?: (active: boolean) => void;
}) {
  const setMessage = useFeedback("success");
  const [tab, setTab] = useState("余额与入口");
  const [opening, setOpening] = useState("");
  const [error, setError] = useErrorState();
  useEffect(() => {
    onDeviceView?.(tab === "校园网设备");
    return () => onDeviceView?.(false);
  }, [tab, onDeviceView]);
  useEffect(() => {
    if (!data.balances && !account.demo)
      void onRefresh().catch((e) => setError(String(e)));
  }, [account.id]);
  async function open(target: string) {
    if (opening) return;
    try {
      if (account.demo) throw Error("请连接校园账号后打开学校网站。");
      setOpening(target);
      await openSchoolPage(account.id, target);
    } catch (e) {
      setError(String(e));
      if (
        e instanceof ManualCaptchaRequired ||
        String(e).includes("登录状态已失效")
      )
        onLoginRequired?.();
    } finally {
      setOpening("");
    }
  }
  return (
    <div className="services-page">
      <PageHeading eyebrow="CAMPUS SERVICES" title="校园服务" />
      <Tabs
        value={tab}
        onValueChange={(next) => setTab(next)}
        variant="underline"
        className="services-subnav"
      >
        <TabsList>
          {["余额与入口", "校园网设备"].map((v) => (
            <TabsTrigger key={v} value={v}>
              {v}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {tab === "校园网设备" ? (
        <DeviceManager account={account} refreshKey={data.syncedAt?.services} />
      ) : (
        <>
          <div className="campus-balances">
            <Card className="p-0 campus-balance-card">
              <CardContent className="campus-balance-content">
                <div className="campus-balance-head">
                  <span className="campus-balance-icon" aria-hidden="true">
                    <Wallet size={18} />
                  </span>
                  <span className="campus-balance-label">校园卡余额</span>
                </div>
                <strong className="campus-balance-amount">
                  ¥ {account.demo ? "128.50" : data.balances?.card || "—"}
                </strong>
              </CardContent>
            </Card>
            <Card className="p-0 campus-balance-card">
              <CardContent className="campus-balance-content">
                <div className="campus-balance-head">
                  <span className="campus-balance-icon" aria-hidden="true">
                    <Wifi size={18} />
                  </span>
                  <span className="campus-balance-label">校园网余额</span>
                </div>
                <div className="campus-balance-bottom">
                  <strong className="campus-balance-amount">
                    ¥ {account.demo ? "35.00" : data.balances?.network || "—"}
                  </strong>
                  <div className="campus-balance-actions">
                    <Button
                      size="sm"
                      disabled={!!opening}
                      onClick={() => open("recharge")}
                    >
                      {opening === "recharge" ? "更新登录状态…" : "校园网充值"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        await copyText(
                          "https://weixin.bjtu.edu.cn/pay/wap/network/recharge.html",
                        );
                        setMessage(
                          "充值链接已复制，可粘贴到微信发送或打开。",
                        );
                      }}
                    >
                      <Link size={13} />
                      分享到微信
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          <section className="surface school-shortcuts">
            <div className="school-shortcuts-header">
              <h2>学校网站快捷入口</h2>
            </div>
            <div className="school-shortcuts-grid">
              {[
                ["mis", "MIS 信息门户", "综合门户与个人信息"],
                ["academic", "教务 AA", "选课、课表与成绩"],
                ["courses", "智慧课程平台", "作业、课件与回放"],
                ["mail", "校园邮箱", "BJTU 校内邮件"],
                ["vpn", "WebVPN", "校外访问内网"],
                ["sso", "新版统一身份认证", "账号安全与密码"],
              ].map(([id, name, desc]) => (
                <button
                  key={id}
                  disabled={!!opening}
                  aria-busy={opening === id}
                  onClick={() => open(id)}
                >
                  <span className="school-shortcut-copy">
                    <strong>
                      {opening === id ? "正在更新登录会话…" : name}
                    </strong>
                    <small>{desc}</small>
                  </span>
                  <ExternalLink size={16} />
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
