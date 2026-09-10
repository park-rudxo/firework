"use client";
import Link from "next/link";
import { useState } from "react";
import { ActionForm } from "./action-form";
import { setSubscription } from "@/features/community/actions";
export function SubscriptionForm({ slug, following, updates, recruitment, ready }: {
  slug: string; following: boolean; updates: boolean; recruitment: boolean; ready: boolean;
}) {
  const [subscribed, setSubscribed] = useState(following);
  const [notifyUpdates, setUpdates] = useState(updates);
  const [notifyRecruitment, setRecruitment] = useState(recruitment);
  return <ActionForm action={setSubscription.bind(null, slug)} label="구독·알림 설정 저장">
    <label className="flex items-center gap-2 font-medium">
      <input type="checkbox" name="subscribed" checked={subscribed} onChange={e => {
        setSubscribed(e.target.checked);
        if (!e.target.checked) { setUpdates(false); setRecruitment(false); }
      }} /> 구독
    </label>
    <p className="text-sm text-muted-foreground">구독하면 내 관심 목록과 캘린더에 표시됩니다. 구독만으로 메시지가 오지는 않습니다.</p>
    <fieldset disabled={!subscribed || !ready} className="space-y-2 rounded-xl border border-border p-4 disabled:opacity-60">
      <legend className="px-1 text-sm font-medium">🔔 Mattermost 알림 — 기본 꺼짐</legend>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="updates" checked={notifyUpdates} onChange={e => setUpdates(e.target.checked)} /> 업데이트·진행 소식 받기</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="recruitment" checked={notifyRecruitment} onChange={e => setRecruitment(e.target.checked)} /> 테스트·설문·이벤트 모집 소식 받기</label>
    </fieldset>
    {!ready ? <p className="text-sm text-muted-foreground">알림을 켜려면 <Link href="/settings/mattermost" className="underline">Mattermost 연결 상태</Link>를 확인해주세요.</p> : null}
    <p className="text-xs text-muted-foreground">선택한 소식 수신에 동의합니다. 언제든 끌 수 있으며, 구독 해제 후 다시 구독해도 알림은 꺼져 있습니다.</p>
  </ActionForm>;
}

