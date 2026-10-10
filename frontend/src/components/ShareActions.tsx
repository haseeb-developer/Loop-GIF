"use client";
import { copyText } from "@/lib/format";
import { buttonClass } from "@/lib/button";
import { Button } from "./ui";
import { CopyIcon, DownloadIcon, LinkIcon } from "./icons";
import { useToast } from "./Toast";

export function ShareActions({ url, downloadUrl }: { url: string; downloadUrl: string }) {
  const toast = useToast();
  const copy = async (text: string, msg: string) => { const ok = await copyText(text); toast(ok ? msg : "Couldn't copy", ok ? "ok" : "error"); };
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <Button variant="primary" onClick={() => copy(url, "GIF link copied")}><CopyIcon />Copy GIF link</Button>
      <Button onClick={() => copy(window.location.href, "Page link copied")}><LinkIcon />Copy page link</Button>
      <a href={downloadUrl} className={buttonClass("secondary")}><DownloadIcon />Download</a>
    </div>
  );
}
