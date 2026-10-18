import { useFeedback } from "./ui";
import { Card, CardContent } from "@/components/motion/card";
import { ErrorAlert } from "./ui";
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
import { withCampusSession } from "./service";
export default function Services({
  account,
  data,
  onRefresh,
  onDeviceView,
}: {
  account: Account;
  data: CampusData;
  onRefresh: () => Promise<void>;
  onDeviceView?: (active: boolean) => void;
}) {
  const setMessage = useFeedback("success");
  const [tab, setTab] = useState("余额与入口");
  const [error, setError] = useState("");
  useEffect(() => {
    onDeviceView?.(tab === "校园网设备");
    return () => onDeviceView?.(false);
  }, [tab, onDeviceView]);
  useEffect(() => {
    if (!data.balances && !account.demo)
      void onRefresh().catch((e) => setError(String(e)));
  }, [account.id]);
  async function open(target: string) {
    try {
      if (account.demo) throw Error("请连接校园账号后打开学校网站。");
      await withCampusSession(account.id, () =>
        invoke("open_school_page", {
          username: account.id,
          target,
          messageId: null,
        }),
      );
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="CAMPUS SERVICES"
        title="校园服务"
        description="余额、校园网络与常用入口，集中在这里。"
      />
      <Tabs
        value={tab}
        onValueChange={(next) => setTab(next)}
        variant="underline"
        className="services-tabs"
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
                <Wallet size={25} />
                <p>校园卡余额</p>
                <strong>
                  ¥ {account.demo ? "128.50" : data.balances?.card || "—"}
                </strong>
              </CardContent>
            </Card>
            <Card className="p-0 campus-balance-card">
              <CardContent className="campus-balance-content">
                <Wifi size={25} />
                <p>校园网余额</p>
                <strong>
                  ¥ {account.demo ? "35.00" : data.balances?.network || "—"}
                </strong>
                <div className="modal-actions">
                  <Button size="sm" onClick={() => open("recharge")}>
                    校园网充值
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      await copyText(
                        "https://weixin.bjtu.edu.cn/pay/wap/network/recharge.html",
                      );
                      setMessage("充值链接已复制，可粘贴到微信发送或打开。");
                    }}
                  >
                    <Link size={13} />
                    分享到微信
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
          <section className="surface school-shortcuts">
            <h2>学校网站快捷入口</h2>
            <div>
              {[
                ["mis", "MIS 信息门户"],
                ["academic", "教务 AA"],
                ["courses", "智慧课程平台"],
                ["mail", "校园邮箱"],
                ["vpn", "WebVPN"],
                ["sso", "新版统一身份认证"],
              ].map(([id, name]) => (
                <button key={id} onClick={() => open(id)}>
                  <span>{name}</span>
                  <ExternalLink size={16} />
                </button>
              ))}
            </div>
          </section>
        </>
      )}
      
      {error && <ErrorAlert message={String(error)} />}
    </>
  );
}
