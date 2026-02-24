// ╔══════════════════════════════════════════════════════════════╗
// ║  📁 register-user / index.ts  【신규 Edge Function】          ║
// ║                                                               ║
// ║  🟣 역할: 회원가입 최종 처리 (파라미터 변조 방지 핵심)           ║
// ║                                                               ║
// ║  🔒 보안 처리:                                                 ║
// ║    ① 프론트에서 받은 realName을 절대 신뢰하지 않음             ║
// ║    ② nice_auth_sessions DB에서 인증된 실명/전화번호 직접 조회  ║
// ║    ③ 세션 만료 여부 서버에서 재검증                            ║
// ║    ④ 검증 통과 후에만 Supabase Auth signUp + user_profiles 저장║
// ║    ⑤ 가입 완료 후 세션 status → 'consumed' (재가입 방지)      ║
// ║                                                               ║
// ║  흐름:                                                         ║
// ║    프론트(닉네임, 이메일, 비번, 주소)                           ║
// ║    → register-user                                            ║
// ║    → DB에서 인증된 실명/전화번호 가져옴 (프론트 값 무시)         ║
// ║    → signUp + user_profiles 저장                              ║
// ╚══════════════════════════════════════════════════════════════╝

import { corsHeaders, handleCors, json, err } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  if (req.method !== 'POST') return err('Method not allowed', 405);

  // ── JWT 인증 (익명 유저 포함) ──────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return err('Authorization header required', 401);

  const sbAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const token = authHeader.replace('Bearer ', '');
  const { data: { user: anonUser }, error: userErr } = await sbAdmin.auth.getUser(token);
  if (userErr || !anonUser) return err('Invalid token', 401);

  // ── 요청 바디 파싱 ──────────────────────────────────────────────
  let body: {
    nickname: string;
    email: string;
    password: string;
    address?: string;
  };

  try {
    body = await req.json();
  } catch {
    return err('Invalid JSON', 400);
  }

  const { nickname, email, password, address = '' } = body;

  // ── 기본 유효성 검사 ────────────────────────────────────────────
  if (!nickname || nickname.length < 2 || nickname.length > 10)
    return err('닉네임은 2~10자여야 합니다.', 400);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return err('올바른 이메일 형식이 아닙니다.', 400);
  if (!password || password.length < 8)
    return err('비밀번호는 8자 이상이어야 합니다.', 400);

  // ─────────────────────────────────────────────────────────────
  // 핵심 보안: nice_auth_sessions에서 verified 세션 직접 조회
  //            프론트에서 받은 realName/phone 은 사용하지 않음
  // ─────────────────────────────────────────────────────────────
  const { data: niceSession, error: niceErr } = await sbAdmin
    .from('nice_auth_sessions')
    .select('real_name, phone, birthdate, gender, dup_info, expires_at, status')
    .eq('user_id', anonUser.id)
    .eq('status', 'verified')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (niceErr || !niceSession) {
    console.warn('verified 세션 없음 - user:', anonUser.id);
    return err('본인인증이 완료되지 않았습니다. 인증 후 다시 시도해주세요.', 403);
  }

  // ── 세션 만료 재검증 ─────────────────────────────────────────
  if (niceSession.expires_at && new Date(niceSession.expires_at) < new Date()) {
    return err('인증 세션이 만료되었습니다(2시간 초과). 다시 인증해주세요.', 410);
  }

  // ── DB에서 가져온 신뢰할 수 있는 값 사용 ──────────────────────
  const verifiedName  = niceSession.real_name || '';
  const verifiedPhone = niceSession.phone     || '';

  if (!verifiedName) {
    return err('인증된 실명 정보가 없습니다. 본인인증을 다시 진행해주세요.', 403);
  }

  try {
    // ── Supabase Auth 회원가입 ──────────────────────────────────
    const { data: signUpData, error: signUpErr } = await sbAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,   // 이메일 인증 링크 발송
      user_metadata: {
        nickname,
        real_name: verifiedName,   // DB에서 가져온 인증된 실명
        phone:     verifiedPhone,  // DB에서 가져온 인증된 전화번호
        address,
      },
    });

    if (signUpErr) {
      const msg = signUpErr.message.includes('already registered')
        ? '이미 가입된 이메일입니다.'
        : signUpErr.message.includes('weak')
        ? '비밀번호가 너무 단순합니다.'
        : signUpErr.message;
      return err(msg, 400);
    }

    const newUserId = signUpData.user?.id;
    if (!newUserId) return err('회원가입 처리 중 오류가 발생했습니다.', 500);

    // ── user_profiles 저장 (신뢰된 값만 사용) ──────────────────
    const { error: profileErr } = await sbAdmin.from('user_profiles').insert({
      user_id:     newUserId,
      nickname:    nickname,
      real_name:   verifiedName,   // 프론트 입력값 아님 — DB 인증값
      phone:       verifiedPhone,  // 프론트 입력값 아님 — DB 인증값
      address:     address,
      is_verified: true,           // 본인인증 완료
      is_premium:  false,
      plays_count: 0,
      created_at:  new Date().toISOString(),
      updated_at:  new Date().toISOString(),
    });

    if (profileErr) {
      console.error('user_profiles 저장 실패:', profileErr);
      // 프로필 저장 실패해도 auth 계정은 생성됨 → 로그만 남기고 성공 처리
    }

    // ─────────────────────────────────────────────────────────
    // 보안⑤: 세션 소비 완료 처리 → 동일 세션으로 재가입 불가
    // ─────────────────────────────────────────────────────────
    await sbAdmin.from('nice_auth_sessions')
      .update({ status: 'consumed', updated_at: new Date().toISOString() })
      .eq('user_id', anonUser.id)
      .eq('status', 'verified');

    console.log(`✅ 회원가입 완료 - newUser:${newUserId} name:${verifiedName}`);

    return json({
      message: '회원가입이 완료되었습니다. 이메일 인증 후 로그인해주세요.',
      email,
    });

  } catch (e) {
    console.error('register-user 오류:', e);
    return err('서버 내부 오류: ' + (e as Error).message, 500);
  }
});
