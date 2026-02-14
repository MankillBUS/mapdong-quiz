-- ============================================================
-- MapDong.com - Supabase 초기화 SQL
-- Supabase > SQL Editor > New Query 에 붙여넣고 Run 하세요
-- ============================================================

-- 1. user_profiles 테이블 생성 (이미 만드셨다면 ALTER로 컬럼 추가)
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plays_count     int8 DEFAULT 0,
  is_premium      boolean DEFAULT false,
  premium_until   timestamptz,
  created_at      timestamptz DEFAULT now(),

  -- 본인인증 컬럼 (나이스 NICE)
  nice_di         text UNIQUE,        -- 중복가입 차단 핵심: 명의별 고유 식별자
  real_name       text,               -- 실명
  birth_date      date,               -- 생년월일
  phone_hash      text,               -- 전화번호 해시 (원문 저장 안 함)
  mobile_co       text,               -- 통신사 (SKT/KT/LGU+/알뜰폰)
  is_verified     boolean DEFAULT false,  -- 본인인증 완료 여부
  verified_at     timestamptz,        -- 본인인증 완료 시간

  UNIQUE(user_id)
);

-- 이미 테이블이 있는 경우 컬럼만 추가 (오류 무시해도 됨)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS nice_di       text,
  ADD COLUMN IF NOT EXISTS real_name     text,
  ADD COLUMN IF NOT EXISTS birth_date    date,
  ADD COLUMN IF NOT EXISTS phone_hash    text,
  ADD COLUMN IF NOT EXISTS mobile_co     text,
  ADD COLUMN IF NOT EXISTS is_verified   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at   timestamptz;

-- nice_di UNIQUE 제약 추가 (중복 명의 차단 핵심)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_nice_di_key'
  ) THEN
    ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_nice_di_key UNIQUE (nice_di);
  END IF;
END $$;

-- ============================================================
-- 2. RLS (Row Level Security) 활성화
-- ============================================================
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- 기존 정책 초기화 후 재생성
DROP POLICY IF EXISTS "본인만 조회" ON public.user_profiles;
DROP POLICY IF EXISTS "본인만 수정" ON public.user_profiles;
DROP POLICY IF EXISTS "서비스 롤은 전체 접근" ON public.user_profiles;

-- 본인 프로필만 읽기 허용
CREATE POLICY "본인만 조회"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() = user_id);

-- 본인 프로필만 수정 허용
CREATE POLICY "본인만 수정"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- insert는 트리거에서만 (service_role 사용)
CREATE POLICY "트리거 insert 허용"
  ON public.user_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 3. 신규 회원 가입 시 프로필 자동 생성 트리거
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, plays_count, is_premium)
  VALUES (NEW.id, 0, false)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 트리거 연결
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 4. 플레이 횟수 증가 함수 (클라이언트에서 직접 호출)
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_plays(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_profile public.user_profiles%ROWTYPE;
BEGIN
  -- 현재 프로필 조회
  SELECT * INTO v_profile
  FROM public.user_profiles
  WHERE user_id = p_user_id;

  -- 인증 안 된 사용자 차단
  IF NOT v_profile.is_verified THEN
    RETURN json_build_object('error', '본인인증이 필요합니다', 'code', 'NOT_VERIFIED');
  END IF;

  -- 프리미엄 만료 체크 및 자동 해제
  IF v_profile.is_premium AND v_profile.premium_until IS NOT NULL
     AND v_profile.premium_until < now() THEN
    UPDATE public.user_profiles
    SET is_premium = false
    WHERE user_id = p_user_id;
    v_profile.is_premium := false;
  END IF;

  -- 비프리미엄이고 300회 초과 시 차단
  IF NOT v_profile.is_premium AND v_profile.plays_count >= 300 THEN
    RETURN json_build_object(
      'error', '체험판 300회를 모두 사용하셨습니다',
      'code', 'TRIAL_EXCEEDED',
      'plays_count', v_profile.plays_count
    );
  END IF;

  -- 플레이 횟수 증가
  UPDATE public.user_profiles
  SET plays_count = plays_count + 1
  WHERE user_id = p_user_id
  RETURNING * INTO v_profile;

  RETURN json_build_object(
    'success', true,
    'plays_count', v_profile.plays_count,
    'is_premium', v_profile.is_premium,
    'premium_until', v_profile.premium_until,
    'remaining', CASE
      WHEN v_profile.is_premium THEN -1
      ELSE GREATEST(0, 300 - v_profile.plays_count)
    END
  );
END;
$$;

-- ============================================================
-- 5. 결제 완료 처리 함수 (Edge Function에서 서비스롤로 호출)
-- ============================================================
CREATE OR REPLACE FUNCTION public.activate_premium(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.user_profiles
  SET
    is_premium    = true,
    premium_until = now() + interval '30 days'
  WHERE user_id = p_user_id;
END;
$$;

-- ============================================================
-- 6. 실행 확인용 조회
-- ============================================================
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'user_profiles'
ORDER BY ordinal_position;
