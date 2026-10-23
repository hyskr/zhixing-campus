import { useErrorState } from "./ui";
import { Input } from "@/components/motion/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/motion/select";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/motion/button";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  ChevronRight,
  GraduationCap,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  authenticateCampus,
  authenticateSso,
  ManualCaptchaRequired,
  type SsoChallenge,
} from "./service";
import { Modal } from "./ui";
import type { Account } from "./types";

export default function LoginModal({
  studentId,
  onClose,
  onSuccess,
}: {
  studentId?: string;
  onClose: () => void;
  onSuccess: (account: Account) => void;
}) {
  const [username, setUsername] = useState(studentId ?? "");
  const [password, setPassword] = useState("");
  const [image, setImage] = useState("");
  const [answer, setAnswer] = useState("");
  const [recognition, setRecognition] = useState("");
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useErrorState();
  const [credentialMode, setCredentialMode] = useState("keychain");
  const remember = credentialMode !== "session";
  const [method, setMethod] = useState("sso");
  const [ssoChallenge, setSsoChallenge] = useState<SsoChallenge | undefined>();
  function preview(nextImage: string, nextAnswer: string, expression: string) {
    setImage(nextImage);
    setAnswer(nextAnswer);
    setRecognition(expression ? `已识别 ${expression} → ${nextAnswer}` : "");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!isTauri()) {
      setError("请在桌面应用中连接校园账号，浏览器可预览演示数据。");
      return;
    }
    setBusy(true);
    try {
      const account =
        method === "sso"
          ? await authenticateSso(
              username.trim(),
              password,
              credentialMode,
              setProgress,
              ssoChallenge,
              manual ? answer : undefined,
            )
          : manual
            ? await invoke<Account>("finish_login", {
                username,
                password,
                answer,
                remember,
                credentialMode,
                loginMethod: "cas",
              })
            : await authenticateCampus(
                username.trim(),
                password,
                remember,
                setProgress,
                preview,
                { credentialMode, loginMethod: "cas" },
              );
      onSuccess(account);
    } catch (reason) {
      if (reason instanceof ManualCaptchaRequired) {
        setManual(true);
        setImage(reason.image);
        setAnswer("");
        setRecognition(reason.message);
        setSsoChallenge(reason.ssoChallenge);
      } else {
        setError(String(reason));
        setManual(false);
        setImage("");
        setSsoChallenge(undefined);
      }
    } finally {
      setBusy(false);
      setProgress("");
    }
  }
  async function refresh() {
    setBusy(true);
    setError("");
    setAnswer("");
    setProgress("正在获取新的验证码");
    try {
      if (method === "sso") {
        const next = await invoke<SsoChallenge>("refresh_sso_captcha", {
          username,
        });
        setSsoChallenge(next);
        setImage(next.image ?? "");
        setManual(true);
        setRecognition("请输入图片中的字母验证码");
        return;
      }
      const result = await invoke<{ image: string }>("begin_login", {
        username,
      });
      setImage(result.image);
      setRecognition("请填写图片中的算式结果");
      setManual(true);
    } catch (reason) {
      setError(String(reason));
      setManual(false);
      setImage("");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }
  return (
    <Modal
      title="连接你的交大校园"
      subtitle="使用学校 MIS 统一身份认证账号登录"
      onClose={busy ? () => {} : onClose}
    >
      <form className="login-form" onSubmit={submit}>
        <div className="login-emblem">
          <GraduationCap size={32} strokeWidth={1.5} />
        </div>
        <label>
          登录入口
          <Select
            value={String(method)}
            disabled={busy || manual}
            onValueChange={(e) => {
              setMethod(e);
              setSsoChallenge(undefined);
            }}
          >
            <SelectTrigger>
              <span className="sr-only">{"登录入口"}：</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sso">统一身份认证 SSO（推荐）</SelectItem>
              <SelectItem value="cas">旧版 CAS（兼容入口）</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label>
          学号
          <Input
            value={String(username)}
            onChange={(e) => setUsername(e)}
            placeholder="请输入学号"
            autoComplete="username"
            required
            disabled={busy || manual}
            pattern="[A-Za-z0-9_]+"
          />
        </label>
        <label>
          密码
          <Input
            type="password"
            value={String(password)}
            onChange={(e) => setPassword(e)}
            placeholder="请输入 MIS 密码"
            autoComplete="current-password"
            required
            disabled={busy || manual}
          />
        </label>
        {image && (
          <div className="captcha-area">
            <label>
              验证码结果
              <div className="captcha-input">
                <img
                  src={
                    image.startsWith("data:")
                      ? image
                      : `data:image/png;base64,${image}`
                  }
                  alt="学校登录验证码"
                />
                <Input
                  value={String(answer)}
                  onChange={(e) => setAnswer(e)}
                  placeholder={
                    method === "sso" ? "填写图片字符" : "填写算式结果"
                  }
                  required={manual}
                  disabled={!manual || busy}
                  aria-label={method === "sso" ? "SSO验证码" : "验证码算式结果"}
                />
              </div>
            </label>
            <p>{recognition}</p>
            {manual && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={refresh}
              >
                <RefreshCw size={13} />
                换一张验证码
              </Button>
            )}
          </div>
        )}
        <label>
          凭据保存方式
          <Select
            value={String(credentialMode)}
            disabled={busy}
            onValueChange={(e) => setCredentialMode(e)}
          >
            <SelectTrigger>
              <span className="sr-only">{"登录凭据保存方式"}：</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="keychain">系统凭据库（推荐）</SelectItem>
              <SelectItem value="file">本机文件（保存密码）</SelectItem>
              <SelectItem value="session">仅本次使用</SelectItem>
            </SelectContent>
          </Select>
        </label>

        <Button
          type="submit"
          className="login-submit"
          disabled={busy || !username || !password || (manual && !answer)}
        >
          {busy ? <LoaderCircle size={16} className="spin" /> : null}
          {busy ? progress || "正在验证校园账号" : "登录并同步校园数据"}
          {!busy && <ChevronRight size={16} />}
        </Button>
        <p className="login-footnote">
          <ShieldCheck size={14} />
          按所选方式保存凭据；“仅本次使用”不保存密码与登录 Cookie
        </p>
      </form>
    </Modal>
  );
}
