// ════════════════════════════════════════════════════════════════
// MapDong Mall — mall-admin.js v2.0
// 전면 재작성: 버그 수정 + 대형 쇼핑몰 수준 관리자 UI
// ════════════════════════════════════════════════════════════════
'use strict';

const AdminPanel = (() => {
  // ── Mall.js의 Supabase 클라이언트 재사용 (중복 생성 방지) ──
  // mall.js보다 나중에 로드되므로 함수 호출 시점에 참조
  const getSb = () => Mall.sb;
  const BUCKET = 'mall-images';

  let _settings = {};
  let _currentPage = 'dashboard';

  // ── 유틸 ─────────────────────────────────────────────────────
  const _fmt = n => Number(n||0).toLocaleString('ko-KR');
  const _date = d => d ? new Date(d).toLocaleDateString('ko-KR') : '—';
  const _datetime = d => d ? new Date(d).toLocaleString('ko-KR') : '—';
  const _statusLabel = s => ({
    paid:'결제완료', preparing:'배송준비중', shipping:'배송중',
    delivered:'배송완료', confirmed:'구매확정',
    return_requested:'반품요청', return_reviewing:'반품심사중',
    return_shipping:'반품배송중', return_completed:'반품완료',
    cancelled:'취소'
  })[s] || s;
  const _statusColor = s => ({
    paid:'var(--accent)', preparing:'var(--gold)', shipping:'#a29bfe',
    delivered:'var(--accent3)', confirmed:'var(--accent3)',
    return_requested:'var(--accent2)', return_reviewing:'var(--accent2)',
    return_shipping:'var(--accent2)', return_completed:'var(--text-dim)',
    cancelled:'var(--text-dim)'
  })[s] || 'var(--text-dim)';
  const toast = (msg, type='info') => Mall.toast(msg, type);

  // ── 설정 로드 ────────────────────────────────────────────────
  async function _loadSettings() {
    const { data } = await getSb().from('mall_settings').select('*');
    if (data) data.forEach(r => { _settings[r.key] = r.value; });
  }

  // ── 초기화 ──────────────────────────────────────────────────
  async function init() {
    console.log('[AdminPanel] init 시작');
    try {
      await _loadSettings();
      console.log('[AdminPanel] settings 로드 완료:', Object.keys(_settings).length, '개');
    } catch(e) {
      console.error('[AdminPanel] settings 로드 실패:', e);
    }
    const page = document.getElementById('page-admin');
    if (!page) { console.error('[AdminPanel] page-admin 요소 없음!'); return; }
    console.log('[AdminPanel] page-admin 요소 확인 완료');
    page.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
      <div>
        <div style="font-family:'Black Han Sans',sans-serif;font-size:1.4rem;color:var(--accent);">⚙️ MapDong Mall 관리자</div>
        <div style="font-size:.75rem;color:var(--text-dim);margin-top:2px;">상품·주문·고객·설정을 한 곳에서 관리합니다</div>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="tbtn active" data-lang="ko" onclick="applyLang('ko')">KO</button>
        <button class="tbtn" data-lang="en" onclick="applyLang('en')">EN</button>
        <button class="tbtn" data-lang="ja" onclick="applyLang('ja')">JA</button>
        <button class="tbtn" data-lang="th" onclick="applyLang('th')">TH</button>
      </div>
    </div>
    <div class="admin-grid">
      <nav class="admin-nav" id="admin-nav">
        <div class="anav-section">📊 현황</div>
        <div class="anav-item" data-p="dashboard" onclick="AdminPanel.nav('dashboard',this)">
          <span>🏠</span><div><div>대시보드</div><div style="font-size:.68rem;color:var(--text-dim);">매출·주문 한눈에</div></div>
        </div>
        <div class="anav-section" style="margin-top:10px;">🛍️ 상품 관리</div>
        <div class="anav-item" data-p="products" onclick="AdminPanel.nav('products',this)">
          <span>📦</span><div><div>상품 목록</div><div style="font-size:.68rem;color:var(--text-dim);">등록 상품 조회·수정</div></div>
        </div>
        <div class="anav-item" data-p="product-add" onclick="AdminPanel.nav('product-add',this)">
          <span>➕</span><div><div>상품 등록</div><div style="font-size:.68rem;color:var(--text-dim);">새 상품 추가</div></div>
        </div>
        <div class="anav-section" style="margin-top:10px;">📋 주문·배송</div>
        <div class="anav-item" data-p="orders" onclick="AdminPanel.nav('orders',this)">
          <span>📋</span><div><div>전체 주문</div><div style="font-size:.68rem;color:var(--text-dim);">주문 확인·상태 변경</div></div>
          <span class="anav-badge" id="badge-orders" style="display:none">0</span>
        </div>
        <div class="anav-item" data-p="returns" onclick="AdminPanel.nav('returns',this)">
          <span>🔄</span><div><div>반품 관리</div><div style="font-size:.68rem;color:var(--text-dim);">반품심사·배송비 청구</div></div>
          <span class="anav-badge" id="badge-returns" style="display:none">0</span>
        </div>
        <div class="anav-section" style="margin-top:10px;">💬 고객 서비스</div>
        <div class="anav-item" data-p="inquiries" onclick="AdminPanel.nav('inquiries',this)">
          <span>❓</span><div><div>1:1 문의</div><div style="font-size:.68rem;color:var(--text-dim);">미답변 문의 처리</div></div>
          <span class="anav-badge" id="badge-inquiries" style="display:none">0</span>
        </div>
        <div class="anav-item" data-p="reviews" onclick="AdminPanel.nav('reviews',this)">
          <span>⭐</span><div><div>후기 관리</div><div style="font-size:.68rem;color:var(--text-dim);">노출·숨김 처리</div></div>
        </div>
        <div class="anav-item" data-p="blacklist" onclick="AdminPanel.nav('blacklist',this)">
          <span>🚫</span><div><div>블랙리스트</div><div style="font-size:.68rem;color:var(--text-dim);">악성 구매자 관리</div></div>
        </div>
        <div class="anav-section" style="margin-top:10px;">⚙️ 설정</div>
        <div class="anav-item" data-p="settings-ship" onclick="AdminPanel.nav('settings-ship',this)">
          <span>🚚</span><div><div>배송·원산지</div><div style="font-size:.68rem;color:var(--text-dim);">전체 상품에 즉시 반영</div></div>
        </div>
        <div class="anav-item" data-p="settings-shop" onclick="AdminPanel.nav('settings-shop',this)">
          <span>🏪</span><div><div>쇼핑몰 설정</div><div style="font-size:.68rem;color:var(--text-dim);">공지·기본 설정</div></div>
        </div>
      </nav>
      <div class="admin-content" id="admin-content">
        <div class="loading">로딩 중...</div>
      </div>
    </div>`;

    // 추가 CSS
    const style = document.createElement('style');
    style.textContent = `
      .anav-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;cursor:pointer;transition:all .2s;color:var(--text-dim);margin-bottom:2px;}
      .anav-item:hover{background:var(--surface2);color:var(--text);}
      .anav-item.active{background:rgba(0,212,255,.12);color:var(--accent);border-left:3px solid var(--accent);padding-left:9px;}
      .anav-item > span:first-child{font-size:1.1rem;flex-shrink:0;width:22px;text-align:center;}
      .anav-badge{margin-left:auto;background:var(--accent2);color:#fff;border-radius:10px;padding:1px 7px;font-size:.65rem;font-weight:700;}
      .ap-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px;}
      .ap-hd h2{font-size:1.1rem;font-weight:700;}
      .ap-hd p{font-size:.75rem;color:var(--text-dim);margin-top:2px;}
      .stat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin-bottom:24px;}
      .stat-card{background:var(--surface2);border-radius:12px;padding:16px;text-align:center;border:1px solid var(--border);}
      .stat-card .num{font-size:1.5rem;font-weight:700;margin-bottom:4px;}
      .stat-card .lbl{font-size:.72rem;color:var(--text-dim);}
      .stat-card .sub{font-size:.68rem;color:var(--text-dim);margin-top:2px;}
      .tbl-wrap{overflow-x:auto;border-radius:10px;border:1px solid var(--border);}
      .atbl{width:100%;border-collapse:collapse;font-size:.82rem;}
      .atbl th{background:var(--surface2);color:var(--text-dim);padding:10px 12px;text-align:left;font-weight:500;border-bottom:1px solid var(--border);white-space:nowrap;}
      .atbl td{padding:10px 12px;border-bottom:1px solid rgba(30,58,95,.3);vertical-align:middle;}
      .atbl tr:last-child td{border-bottom:none;}
      .atbl tr:hover td{background:rgba(0,212,255,.03);}
      .pg-wrap{display:flex;align-items:center;justify-content:space-between;margin-top:16px;flex-wrap:wrap;gap:8px;}
      .pg-btns{display:flex;gap:4px;}
      .pg-btn{background:var(--surface2);border:1px solid var(--border);color:var(--text-dim);border-radius:6px;padding:5px 10px;font-size:.78rem;cursor:pointer;transition:all .2s;}
      .pg-btn:hover{border-color:var(--accent);color:var(--accent);}
      .pg-btn.active{background:var(--accent);color:#000;border-color:var(--accent);}
      .search-row{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;}
      .search-row input,.search-row select{background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:8px 12px;font-size:.85rem;font-family:'Noto Sans KR',sans-serif;outline:none;}
      .search-row input:focus,.search-row select:focus{border-color:var(--accent);}
      .sbtn-primary{background:linear-gradient(135deg,var(--accent),#0099bb);border:none;color:#000;border-radius:8px;padding:8px 18px;font-size:.85rem;font-weight:700;cursor:pointer;}
      .sbtn-green{background:rgba(57,255,20,.12);border:1px solid var(--accent3);color:var(--accent3);border-radius:8px;padding:7px 14px;font-size:.82rem;cursor:pointer;}
      .sbtn-red{background:rgba(255,60,110,.12);border:1px solid var(--accent2);color:var(--accent2);border-radius:8px;padding:7px 14px;font-size:.82rem;cursor:pointer;}
      .sbtn-gold{background:rgba(255,215,0,.12);border:1px solid var(--gold);color:var(--gold);border-radius:8px;padding:7px 14px;font-size:.82rem;cursor:pointer;}
      .sbtn-sm{padding:4px 10px;font-size:.75rem;}
      .form-sec{background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:16px;}
      .form-sec h3{font-size:.9rem;font-weight:700;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid var(--border);}
      .frow{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
      .frow3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;}
      .fg{margin-bottom:14px;}
      .fg label{display:block;font-size:.8rem;color:var(--text-dim);margin-bottom:5px;font-weight:500;}
      .fg .hint{font-size:.71rem;color:var(--text-dim);margin-top:3px;line-height:1.4;}
      .finput,.fselect,.ftextarea{width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:9px 12px;font-size:.85rem;font-family:'Noto Sans KR',sans-serif;outline:none;transition:border-color .2s;}
      .finput:focus,.fselect:focus,.ftextarea:focus{border-color:var(--accent);}
      .ftextarea{resize:vertical;min-height:80px;}
      .upload-zone{border:2px dashed var(--border);border-radius:10px;padding:20px;text-align:center;cursor:pointer;color:var(--text-dim);font-size:.85rem;transition:all .2s;}
      .upload-zone:hover{border-color:var(--accent);color:var(--accent);}
      .thumb-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}
      .thumb-item{position:relative;width:76px;height:76px;}
      .thumb-item img{width:100%;height:100%;object-fit:cover;border-radius:7px;border:1px solid var(--border);}
      .thumb-del{position:absolute;top:-5px;right:-5px;background:var(--accent2);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:.62rem;cursor:pointer;display:flex;align-items:center;justify-content:center;}
      .editor-toolbar{display:flex;gap:5px;flex-wrap:wrap;background:var(--bg);border:1px solid var(--border);border-bottom:none;border-radius:8px 8px 0 0;padding:7px;}
      .editor-toolbar button,.editor-toolbar select{background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:5px;padding:3px 8px;font-size:.8rem;cursor:pointer;font-family:'Noto Sans KR',sans-serif;}
      .editor-area{min-height:200px;background:var(--bg);border:1px solid var(--border);border-radius:0 0 8px 8px;padding:12px;font-size:.88rem;line-height:1.7;outline:none;}
      .editor-area img{max-width:780px;width:100%;}
      .sale-preview{background:rgba(0,212,255,.06);border:1px solid rgba(0,212,255,.15);border-radius:8px;padding:10px 14px;font-size:.88rem;margin-bottom:14px;}
      .parts-row{display:grid;grid-template-columns:120px 1fr 110px 90px auto;gap:8px;align-items:center;margin-bottom:8px;}
      .fopt-row{display:grid;grid-template-columns:1fr 1fr 36px 80px 90px auto;gap:8px;align-items:center;margin-bottom:8px;}
      .status-badge{display:inline-block;padding:3px 9px;border-radius:10px;font-size:.73rem;font-weight:700;}
      .order-detail-modal{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;}
      .order-detail-box{background:var(--surface);border:1px solid var(--border);border-radius:16px;width:100%;max-width:560px;max-height:85vh;overflow-y:auto;padding:24px;}
      @media(max-width:768px){.frow,.frow3{grid-template-columns:1fr;}.parts-row{grid-template-columns:1fr 1fr;}.fopt-row{grid-template-columns:1fr 1fr;}}
    `;
    document.head.appendChild(style);

    _loadBadges();
    nav('dashboard', document.querySelector('.anav-item'));
  }

  // ── 뱃지 로드 ────────────────────────────────────────────────
  async function _loadBadges() {
    const [r1, r2, r3] = await Promise.all([
      getSb().from('mall_orders').select('*',{count:'exact',head:true}).eq('status','paid'),
      getSb().from('mall_orders').select('*',{count:'exact',head:true}).in('status',['return_requested','return_reviewing']),
      getSb().from('mall_inquiries').select('*',{count:'exact',head:true}).is('answer',null).eq('is_visible',true),
    ]);
    const set = (id, n) => { const el=document.getElementById(id); if(el){el.textContent=n; el.style.display=n>0?'':'none';} };
    set('badge-orders', r1.count||0);
    set('badge-returns', r2.count||0);
    set('badge-inquiries', r3.count||0);
  }

  // ── 네비게이션 ───────────────────────────────────────────────
  function nav(page, el) {
    _currentPage = page;
    document.querySelectorAll('.anav-item').forEach(a => a.classList.remove('active'));
    if (el) el.classList.add('active');
    else {
      const target = document.querySelector(`.anav-item[data-p="${page}"]`);
      if (target) target.classList.add('active');
    }
    _renderPage(page);
  }

  async function _renderPage(page) {
    console.log('[AdminPanel] _renderPage:', page);
    const el = document.getElementById('admin-content');
    if (!el) { console.error('[AdminPanel] admin-content 요소 없음!'); return; }
    el.innerHTML = '<div class="loading" style="padding:60px;text-align:center;color:var(--text-dim);">불러오는 중...</div>';
    try {
      switch(page) {
        case 'dashboard':    await _pageDashboard(el); break;
        case 'products':     await _pageProducts(el); break;
        case 'product-add':  _pageProductForm(el, null); break;
        case 'orders':       await _pageOrders(el); break;
        case 'returns':      await _pageReturns(el); break;
        case 'inquiries':    await _pageInquiries(el); break;
        case 'reviews':      await _pageReviews(el); break;
        case 'blacklist':    await _pageBlacklist(el); break;
        case 'settings-ship': _pageSettingsShip(el); break;
        case 'settings-shop': _pageSettingsShop(el); break;
        default: el.innerHTML = '<div style="padding:40px;color:var(--text-dim);">페이지를 찾을 수 없습니다.</div>';
      }
    } catch(e) {
      console.error('[AdminPanel] _renderPage 오류:', e);
      el.innerHTML = `<div style="padding:40px;color:var(--accent2);">
        <b>오류 발생</b><br>${e.message}<br><br>
        <pre style="font-size:.72rem;color:var(--text-dim);white-space:pre-wrap;">${e.stack||''}</pre>
      </div>`;
    }
  }

  // ════════════════════════════════════════════════════════════
  // 대시보드
  // ════════════════════════════════════════════════════════════
  async function _pageDashboard(el) {
    console.log('[AdminPanel] _pageDashboard 시작, getSb():', typeof getSb());
    let daily, totalOrders, pendingOrders, topProds, totalProds, lowStock;
    try {
      const results = await Promise.all([
        getSb().from('mall_orders')
          .select('created_at, final_price')
          .not('status','eq','cancelled')
          .gte('created_at', new Date(Date.now() - 30*24*60*60*1000).toISOString())
          .order('created_at', {ascending:false}),
        getSb().from('mall_orders').select('*',{count:'exact',head:true}).not('status','eq','cancelled'),
        getSb().from('mall_orders').select('*',{count:'exact',head:true}).eq('status','paid'),
        getSb().from('mall_products').select('id,name,sold_count,stock,sale_price,category_slug').order('sold_count',{ascending:false}).limit(5),
        getSb().from('mall_products').select('*',{count:'exact',head:true}).eq('is_active',true),
        getSb().from('mall_products').select('*',{count:'exact',head:true}).lte('stock',5).gt('stock',0),
      ]);
      console.log('[AdminPanel] 쿼리 결과:', results.map(r => ({data: r.data, count: r.count, error: r.error?.message})));
      // 안전한 데이터 추출 (배열이 아니면 빈 배열로)
      daily       = Array.isArray(results[0].data) ? results[0].data : [];
      totalOrders = results[1].count ?? 0;
      pendingOrders = results[2].count ?? 0;
      topProds    = Array.isArray(results[3].data) ? results[3].data : [];
      totalProds  = results[4].count ?? 0;
      lowStock    = results[5].count ?? 0;
    } catch(e) {
      console.error('[AdminPanel] 대시보드 쿼리 오류:', e);
      el.innerHTML = `<div style="padding:40px;color:var(--accent2);">쿼리 오류: ${e.message}</div>`;
      return;
    }
    // orders 배열에서 직접 집계
    const today = new Date().toDateString();
    const todayOrders = (daily||[]).filter(o => new Date(o.created_at).toDateString() === today);
    const todayRev = todayOrders.reduce((s,o)=>s+Number(o.final_price||0),0);
    const todayOrds = todayOrders.length;
    const weekAgo = Date.now() - 7*24*60*60*1000;
    const weekRev = (daily||[]).filter(o=>new Date(o.created_at).getTime()>weekAgo).reduce((s,o)=>s+Number(o.final_price||0),0);
    const monthRev = (daily||[]).reduce((s,o)=>s+Number(o.final_price||0),0);

    el.innerHTML = `
    <div class="ap-hd"><div><h2>📊 대시보드</h2><p>실시간 매출 현황과 주요 통계를 확인합니다.</p></div>
      <button class="sbtn-primary" onclick="AdminPanel._renderPage('dashboard')" style="font-size:.78rem;padding:7px 14px;">🔄 새로고침</button>
    </div>

    <div class="stat-grid">
      <div class="stat-card"><div class="num" style="color:var(--accent);">₩${_fmt(todayRev)}</div><div class="lbl">오늘 매출</div><div class="sub">주문 ${todayOrds}건</div></div>
      <div class="stat-card"><div class="num" style="color:var(--gold);">₩${_fmt(weekRev)}</div><div class="lbl">최근 7일</div></div>
      <div class="stat-card"><div class="num" style="color:#a29bfe;">₩${_fmt(monthRev)}</div><div class="lbl">이번 달</div></div>
      <div class="stat-card"><div class="num">${totalOrders||0}</div><div class="lbl">전체 주문</div></div>
      <div class="stat-card" style="border-color:var(--accent2);"><div class="num" style="color:var(--accent2);">${pendingOrders||0}</div><div class="lbl">처리 대기</div><div class="sub">결제완료 상태</div></div>
      <div class="stat-card"><div class="num">${totalProds||0}</div><div class="lbl">등록 상품</div></div>
      ${(lowStock||0)>0?`<div class="stat-card" style="border-color:var(--gold);"><div class="num" style="color:var(--gold);">${lowStock}</div><div class="lbl">재고 부족</div><div class="sub">5개 이하</div></div>`:''}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;flex-wrap:wrap;">
      <div>
        <h3 style="font-size:.9rem;font-weight:700;margin-bottom:10px;">🏆 판매 Top 5</h3>
        <div class="tbl-wrap">
          <table class="atbl">
            <thead><tr><th>상품명</th><th>판매</th><th>재고</th><th>단가</th></tr></thead>
            <tbody>${(topProds||[]).map(p=>`
            <tr>
              <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.name}</td>
              <td>${p.sold_count||0}개</td>
              <td style="color:${(p.stock||0)<=5?'var(--accent2)':'var(--accent3)'};">${p.stock||0}${(p.stock||0)===0?' 품절':''}</td>
              <td>₩${_fmt(p.sale_price||0)}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
      </div>
      <div>
        <h3 style="font-size:.9rem;font-weight:700;margin-bottom:10px;">📅 최근 7일 매출</h3>
        <div class="tbl-wrap">
          <table class="atbl">
            <thead><tr><th>날짜</th><th>주문</th><th>매출</th></tr></thead>
            <tbody>${(()=>{
              const dayMap = {};
              (daily||[]).forEach(o=>{
                const d = new Date(o.created_at).toLocaleDateString('ko-KR');
                if(!dayMap[d]) dayMap[d]={cnt:0,rev:0};
                dayMap[d].cnt++; dayMap[d].rev+=Number(o.final_price||0);
              });
              const days = Object.entries(dayMap).slice(0,7);
              return days.length ? days.map(([d,v])=>`
              <tr><td>${d}</td><td>${v.cnt}건</td><td>₩${_fmt(v.rev)}</td></tr>`).join('') :
              '<tr><td colspan="3" style="text-align:center;color:var(--text-dim);padding:20px;">주문 없음</td></tr>';
            })()}</tbody>
          </table>
        </div>
      </div>
    </div>`;
  }

  // ════════════════════════════════════════════════════════════
  // 상품 목록
  // ════════════════════════════════════════════════════════════
  async function _pageProducts(el, catFilter='', search='') {
    let q = getSb().from('mall_products').select('*').order('created_at',{ascending:false});
    if (catFilter) q = q.eq('category_slug', catFilter);
    if (search) q = q.ilike('name', `%${search}%`);
    const { data } = await q;

    el.innerHTML = `
    <div class="ap-hd">
      <div><h2>📦 상품 목록</h2><p>등록된 상품을 조회하고 수정합니다.</p></div>
      <button class="sbtn-green" onclick="AdminPanel.nav('product-add',null)">➕ 상품 등록</button>
    </div>
    <div class="search-row">
      <input id="prod-search" placeholder="상품명 검색..." style="flex:1;max-width:280px;" onkeydown="if(event.key==='Enter')AdminPanel._searchProducts()">
      <select id="prod-cat-filter" onchange="AdminPanel._searchProducts()">
        <option value="">전체 카테고리</option>
        <option value="computer">💻 컴퓨터</option>
        <option value="general">📦 일반제품</option>
        <option value="fashion">👗 패션</option>
        <option value="book">📚 도서</option>
      </select>
      <button class="sbtn-primary" onclick="AdminPanel._searchProducts()">검색</button>
    </div>
    <div class="tbl-wrap">
      <table class="atbl">
        <thead><tr><th>이미지</th><th>상품명</th><th>카테고리</th><th>원가</th><th>할인</th><th>판매가</th><th>재고</th><th>판매</th><th>상태</th><th style="min-width:100px;">관리</th></tr></thead>
        <tbody>${(data||[]).length === 0 ? `<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--text-dim);">등록된 상품이 없습니다.</td></tr>` :
          (data||[]).map(p=>`
          <tr>
            <td>${p.thumbnail_url?`<img src="${p.thumbnail_url}" style="width:48px;height:48px;object-fit:cover;border-radius:7px;border:1px solid var(--border);">`:'<div style="width:48px;height:48px;background:var(--surface2);border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;">📦</div>'}</td>
            <td style="max-width:180px;"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;">${p.name}</div></td>
            <td><span style="background:var(--surface2);padding:2px 8px;border-radius:6px;font-size:.75rem;">${{computer:'💻',general:'📦',fashion:'👗',book:'📚'}[p.category_slug]||'📦'} ${p.category_slug}</span></td>
            <td>₩${_fmt(p.price)}</td>
            <td>${p.discount_rate>0?`<span style="color:var(--accent2);font-weight:700;">${p.discount_rate}%</span>`:'—'}</td>
            <td style="font-weight:700;">₩${_fmt(p.sale_price||p.price)}</td>
            <td style="color:${(p.stock||0)<=0?'var(--accent2)':(p.stock||0)<=5?'var(--gold)':'var(--accent3)'};">
              ${(p.stock||0)===0?'품절':`${p.stock||0}개`}${(p.stock||0)>0&&(p.stock||0)<=(p.stock_alert||5)?'⚠️':''}
            </td>
            <td>${p.sold_count||0}개</td>
            <td><span style="color:${p.is_active?'var(--accent3)':'var(--text-dim)'};">${p.is_active?'●노출':'●숨김'}</span></td>
            <td style="white-space:nowrap;">
              <button class="sbtn-primary sbtn-sm" onclick="AdminPanel._editProduct('${p.id}')" style="margin-right:4px;">수정</button>
              <button class="sbtn-red sbtn-sm" onclick="AdminPanel._deleteProduct('${p.id}','${p.name.replace(/'/g,"\\'")}')">삭제</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top:10px;font-size:.78rem;color:var(--text-dim);">총 ${(data||[]).length}개 상품</div>`;
  }

  function _searchProducts() {
    const search = document.getElementById('prod-search')?.value||'';
    const cat = document.getElementById('prod-cat-filter')?.value||'';
    _pageProducts(document.getElementById('admin-content'), cat, search);
  }

  // ════════════════════════════════════════════════════════════
  // 상품 등록/수정 폼
  // ════════════════════════════════════════════════════════════
  function _pageProductForm(el, editData) {
    const isEdit = !!editData;
    const p = editData || {};

    el.innerHTML = `
    <div class="ap-hd">
      <div><h2>${isEdit?'✏️ 상품 수정':'➕ 상품 등록'}</h2>
        <p>이미지는 업로드 시 자동으로 가로 780px 기준으로 리사이징됩니다.</p>
      </div>
      <button class="sbtn-red" onclick="AdminPanel.nav('products',null)">← 목록으로</button>
    </div>

    <!-- 기본 정보 -->
    <div class="form-sec">
      <h3>📋 기본 정보</h3>
      <div class="frow">
        <div class="fg">
          <label>카테고리 *</label>
          <select class="fselect" id="pf-cat" onchange="AdminPanel._onCatChange()">
            <option value="">선택하세요</option>
            <option value="computer" ${p.category_slug==='computer'?'selected':''}>💻 컴퓨터</option>
            <option value="general" ${p.category_slug==='general'?'selected':''}>📦 일반제품</option>
            <option value="fashion" ${p.category_slug==='fashion'?'selected':''}>👗 패션</option>
            <option value="book" ${p.category_slug==='book'?'selected':''}>📚 도서</option>
          </select>
          <div class="hint">💻 컴퓨터 선택 시 PC 부품 옵션이 추가됩니다</div>
        </div>
        <div class="fg">
          <label>노출 상태</label>
          <select class="fselect" id="pf-active">
            <option value="1" ${p.is_active!==false?'selected':''}>✅ 노출 중 — 고객에게 보입니다</option>
            <option value="0" ${p.is_active===false?'selected':''}>🚫 숨김 — 고객에게 보이지 않습니다</option>
          </select>
        </div>
      </div>
      <div class="fg">
        <label>상품명 *</label>
        <input class="finput" id="pf-name" value="${p.name||''}" placeholder="예: 게이밍 PC 고사양 RTX 4070 티 시리즈">
      </div>
    </div>

    <!-- 가격·재고 -->
    <div class="form-sec">
      <h3>💰 가격 및 재고</h3>
      <div class="frow">
        <div class="fg">
          <label>원가 (원) *</label>
          <input class="finput" id="pf-price" type="number" min="0" value="${p.price||''}" placeholder="예: 1200000" oninput="AdminPanel._calcSale()">
          <div class="hint">할인 전 정가입니다</div>
        </div>
        <div class="fg">
          <label>할인율 (%)</label>
          <input class="finput" id="pf-discount" type="number" min="0" max="100" value="${p.discount_rate||0}" oninput="AdminPanel._calcSale()">
          <div class="hint">0~100 입력. 20% 입력 시 정가에서 20% 할인 자동 적용</div>
        </div>
      </div>
      <div class="sale-preview">
        판매가: <strong id="pf-sale-preview" style="color:var(--accent);font-size:1.1rem;">₩${_fmt(p.sale_price||p.price||0)}</strong>
        <span id="pf-discount-text" style="color:var(--accent2);margin-left:8px;font-size:.85rem;"></span>
      </div>
      <div class="frow">
        <div class="fg">
          <label>재고 수량 *</label>
          <input class="finput" id="pf-stock" type="number" min="0" value="${p.stock||0}">
          <div class="hint">0이면 자동으로 품절 표시됩니다</div>
        </div>
        <div class="fg">
          <label>재고 경고 기준 (개)</label>
          <input class="finput" id="pf-alert" type="number" min="0" value="${p.stock_alert||5}">
          <div class="hint">이 수량 이하면 관리자 대시보드에 경고 표시</div>
        </div>
      </div>
      <div class="frow">
        <div class="fg">
          <label>배송 설정</label>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:9px 12px;">
            <input type="checkbox" id="pf-freeship" ${p.is_free_ship!==false?'checked':''} style="width:16px;height:16px;">
            <div><div style="font-size:.85rem;">이 상품은 무료배송</div>
              <div style="font-size:.72rem;color:var(--text-dim);">체크 해제 시 전역 배송비(₩${_fmt(_settings.ship_fee||3000)}) 적용</div>
            </div>
          </label>
        </div>
        <div class="fg">
          <label>화물 여부</label>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:9px 12px;">
            <input type="checkbox" id="pf-cargo" ${p.is_cargo?'checked':''} style="width:16px;height:16px;">
            <div><div style="font-size:.85rem;">화물 상품</div>
              <div style="font-size:.72rem;color:var(--text-dim);">반품 시 화물 배송비(₩${_fmt(_settings.return_fee_cargo||10000)}) 적용</div>
            </div>
          </label>
        </div>
      </div>
    </div>

    <!-- 이미지 -->
    <div class="form-sec">
      <h3>🖼️ 이미지</h3>
      <div class="fg">
        <label>대표 이미지 (썸네일) *</label>
        <div class="hint">상품 목록에서 보이는 메인 이미지 — 자동으로 가로 780px 리사이징</div>
        <div class="upload-zone" onclick="document.getElementById('pf-thumb-file').click()" style="margin-top:6px;">
          📷 클릭하여 대표 이미지 선택
        </div>
        <input type="file" id="pf-thumb-file" accept="image/*" style="display:none" onchange="AdminPanel._previewThumb(this)">
        <div id="pf-thumb-preview" style="margin-top:8px;"></div>
        <input type="hidden" id="pf-thumb-url" value="${p.thumbnail_url||''}">
        ${p.thumbnail_url?`<div style="margin-top:6px;"><img src="${p.thumbnail_url}" style="width:80px;height:80px;object-fit:cover;border-radius:7px;border:1px solid var(--border);"></div>`:''}
      </div>
      <div class="fg">
        <label>추가 이미지 (최대 6장)</label>
        <div class="hint">상세 페이지 슬라이드쇼로 표시 — 여러 장 동시 선택 가능</div>
        <div class="upload-zone" onclick="document.getElementById('pf-imgs-file').click()" style="margin-top:6px;">
          🖼️ 클릭하여 추가 이미지 선택 (여러 장 가능)
        </div>
        <input type="file" id="pf-imgs-file" accept="image/*" multiple style="display:none" onchange="AdminPanel._previewExtraImgs(this)">
        <div class="thumb-row" id="pf-imgs-preview"></div>
      </div>
    </div>

    <!-- 상세 설명 에디터 -->
    <div class="form-sec">
      <h3>📝 상세 설명</h3>
      <div class="hint" style="margin-bottom:8px;">글꼴 크기·색상·정렬·이미지 삽입 가능. 상품 상세 페이지에 그대로 표시됩니다.</div>
      <div class="editor-toolbar">
        <button type="button" onclick="AdminPanel._edCmd('bold')"><b>B</b></button>
        <button type="button" onclick="AdminPanel._edCmd('italic')"><i>I</i></button>
        <button type="button" onclick="AdminPanel._edCmd('underline')"><u>U</u></button>
        <button type="button" onclick="AdminPanel._edCmd('strikeThrough')"><s>S</s></button>
        <select onchange="AdminPanel._edCmd('fontSize',this.value);this.selectedIndex=0;">
          <option value="">글자 크기</option>
          <option value="1">작게</option><option value="3">보통</option>
          <option value="5">크게</option><option value="7">매우 크게</option>
        </select>
        <input type="color" onchange="AdminPanel._edCmd('foreColor',this.value)" title="글자색" style="width:32px;height:28px;border:1px solid var(--border);border-radius:5px;padding:0;cursor:pointer;background:none;">
        <button type="button" onclick="AdminPanel._edCmd('justifyLeft')">◀</button>
        <button type="button" onclick="AdminPanel._edCmd('justifyCenter')">≡</button>
        <button type="button" onclick="AdminPanel._edCmd('justifyRight')">▶</button>
        <button type="button" onclick="AdminPanel._edInsertImg()">🖼️ 이미지</button>
        <button type="button" onclick="AdminPanel._edCmd('insertHorizontalRule')">── 구분선</button>
      </div>
      <div class="editor-area" id="pf-editor" contenteditable="true">${p.description||''}</div>
    </div>

    <!-- 카테고리별 추가 옵션 -->
    <div id="cat-extra"></div>

    <!-- 한국 법적 표기 미리보기 -->
    <div class="form-sec" style="border-color:rgba(0,212,255,.2);">
      <h3>📋 상품 상세 하단 자동 표기 (미리보기)</h3>
      <div class="hint" style="margin-bottom:10px;">배송·원산지 설정에서 변경 시 등록된 모든 상품에 즉시 반영됩니다.</div>
      <table style="width:100%;font-size:.82rem;border-collapse:collapse;">
        <tr><td style="color:var(--text-dim);padding:4px 0;width:80px;">원산지</td><td style="color:var(--text);">${_settings.origin||'대한민국'}</td></tr>
        <tr><td style="color:var(--text-dim);padding:4px 0;">택배사</td><td style="color:var(--text);">${_settings.courier||'CJ대한통운'}</td></tr>
        <tr><td style="color:var(--text-dim);padding:4px 0;">A/S</td><td style="color:var(--text);">${_settings.as_phone||'—'}</td></tr>
        <tr><td style="color:var(--text-dim);padding:4px 0;">반품교환</td><td style="color:var(--text);">${_settings.as_address||'—'}</td></tr>
        <tr><td style="color:var(--text-dim);padding:4px 0;">반품배송비</td><td style="color:var(--text);">일반 ₩${_fmt(_settings.return_fee||5000)} / 화물 ₩${_fmt(_settings.return_fee_cargo||10000)}</td></tr>
        <tr><td style="color:var(--text-dim);padding:4px 0;">반품기간</td><td style="color:var(--text);">배송완료 후 ${_settings.return_period||3}일 이내</td></tr>
      </table>
      <button class="sbtn-primary sbtn-sm" onclick="AdminPanel.nav('settings-ship',null)" style="margin-top:10px;">⚙️ 원산지·배송 설정 변경</button>
    </div>

    <!-- 저장 버튼 -->
    <div style="display:flex;gap:10px;padding:16px 0;">
      <button class="sbtn-primary" onclick="AdminPanel._submitProduct('${p.id||''}')">
        💾 ${isEdit?'수정 완료':'상품 등록'}
      </button>
      <button class="sbtn-red" onclick="AdminPanel.nav('products',null)">취소</button>
    </div>`;

    // 카테고리별 추가 영역 초기화
    if (p.category_slug) _onCatChange(p.category_slug, p);
    _calcSale();
  }

  function _calcSale() {
    const price = parseInt(document.getElementById('pf-price')?.value||0);
    const disc = parseInt(document.getElementById('pf-discount')?.value||0);
    const sale = disc > 0 ? price - Math.floor(price * disc / 100) : price;
    const preview = document.getElementById('pf-sale-preview');
    const discText = document.getElementById('pf-discount-text');
    if (preview) preview.textContent = `₩${_fmt(sale)}`;
    if (discText) discText.textContent = disc > 0 ? `(${disc}% 할인 적용)` : '';
  }

  function _onCatChange(forceSlug, editData) {
    const slug = forceSlug || document.getElementById('pf-cat')?.value;
    const wrap = document.getElementById('cat-extra');
    if (!wrap) return;

    if (slug === 'computer') {
      wrap.innerHTML = `
      <div class="form-sec">
        <h3>🖥️ PC 부품 옵션 <span style="font-size:.75rem;color:var(--text-dim);font-weight:400;">— 고객이 선택 시 가격 자동 계산</span></h3>
        <div class="hint" style="margin-bottom:12px;">각 부품 종류(CPU, RAM, VGA 등)별로 선택 가능한 옵션을 추가하세요. 추가금액이 0이면 기본 포함입니다.</div>
        <div style="display:grid;grid-template-columns:120px 1fr 110px 90px auto;gap:8px;margin-bottom:6px;font-size:.75rem;color:var(--text-dim);padding:0 4px;">
          <span>부품 종류</span><span>부품명</span><span>추가금액(원)</span><span>기본선택</span><span></span>
        </div>
        <div id="pc-parts-editor"></div>
        <button type="button" class="sbtn-green" onclick="AdminPanel._addPartRow(null)" style="margin-top:8px;">+ 부품 추가</button>
      </div>`;
      (editData?.parts||[]).forEach(pt => _addPartRow(pt));
    } else if (slug === 'fashion') {
      wrap.innerHTML = `
      <div class="form-sec">
        <h3>👗 사이즈·색상 옵션 <span style="font-size:.75rem;color:var(--text-dim);font-weight:400;">— 옵션별 재고 관리</span></h3>
        <div class="hint" style="margin-bottom:12px;">사이즈와 색상 조합별로 재고를 따로 관리합니다. 추가금액이 0이면 기본가와 동일합니다.</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 36px 80px 90px auto;gap:8px;margin-bottom:6px;font-size:.75rem;color:var(--text-dim);padding:0 4px;">
          <span>사이즈</span><span>색상명</span><span>색</span><span>재고</span><span>추가금액</span><span></span>
        </div>
        <div id="fashion-opts-editor"></div>
        <button type="button" class="sbtn-green" onclick="AdminPanel._addFashionOpt(null)" style="margin-top:8px;">+ 옵션 추가</button>
      </div>`;
      (editData?.fashOpts||[]).forEach(o => _addFashionOpt(o));
    } else if (slug === 'book') {
      wrap.innerHTML = `
      <div class="form-sec">
        <h3>📚 도서 정보</h3>
        <div class="frow">
          <div class="fg"><label>ISBN</label><input class="finput" id="pf-isbn" value="${editData?.book_isbn||''}" placeholder="978-89-..."></div>
          <div class="fg"><label>저자</label><input class="finput" id="pf-author" value="${editData?.book_author||''}" placeholder="저자명"></div>
        </div>
        <div class="frow">
          <div class="fg"><label>출판사</label><input class="finput" id="pf-publisher" value="${editData?.book_publisher||''}" placeholder="출판사명"></div>
          <div class="fg"><label>출판일</label><input class="finput" id="pf-pubdate" type="date" value="${editData?.book_pub_date||''}"></div>
        </div>
      </div>`;
    } else {
      wrap.innerHTML = '';
    }
  }

  function _addPartRow(data) {
    const wrap = document.getElementById('pc-parts-editor');
    if (!wrap) return;
    const row = document.createElement('div');
    row.style = 'display:grid;grid-template-columns:120px 1fr 110px 90px auto;gap:8px;align-items:center;margin-bottom:8px;';
    row.innerHTML = `
    <select class="fselect" name="part-type" style="padding:7px 8px;">
      ${['CPU','RAM','VGA','M/B','SSD','HDD','CASE','PSU','COOLER','OS','기타'].map(t=>`<option value="${t}" ${data?.part_type===t?'selected':''}>${t}</option>`).join('')}
    </select>
    <input class="finput" name="part-name" placeholder="예: Intel i9-14900K" value="${data?.name||''}">
    <input class="finput" name="part-delta" type="number" placeholder="0=기본포함" value="${data?.price_delta||0}">
    <label style="display:flex;align-items:center;gap:5px;font-size:.8rem;cursor:pointer;">
      <input type="checkbox" name="part-default" ${data?.is_default?'checked':''} style="width:15px;height:15px;"> 기본
    </label>
    <button type="button" class="sbtn-red sbtn-sm" onclick="this.parentElement.remove()" style="width:32px;height:32px;padding:0;">✕</button>`;
    wrap.appendChild(row);
  }

  function _addFashionOpt(data) {
    const wrap = document.getElementById('fashion-opts-editor');
    if (!wrap) return;
    const row = document.createElement('div');
    row.style = 'display:grid;grid-template-columns:1fr 1fr 36px 80px 90px auto;gap:8px;align-items:center;margin-bottom:8px;';
    row.innerHTML = `
    <input class="finput" name="fopt-size" placeholder="S/M/L/XL" value="${data?.size||''}">
    <input class="finput" name="fopt-color" placeholder="블랙/화이트" value="${data?.color||''}">
    <input type="color" name="fopt-hex" value="${data?.color_hex||'#000000'}" style="width:36px;height:36px;border:1px solid var(--border);border-radius:6px;cursor:pointer;background:none;">
    <input class="finput" name="fopt-stock" type="number" placeholder="재고" value="${data?.stock||0}" min="0">
    <input class="finput" name="fopt-delta" type="number" placeholder="추가금액" value="${data?.price_delta||0}">
    <button type="button" class="sbtn-red sbtn-sm" onclick="this.parentElement.remove()" style="width:32px;height:32px;padding:0;">✕</button>`;
    wrap.appendChild(row);
  }

  // 이미지 리사이징 (가로 780px 고정, 세로 비율 유지)
  function _resize(file) {
    return new Promise(resolve => {
      const r = new FileReader();
      r.onload = e => {
        const img = new Image();
        img.onload = () => {
          const maxW = 780;
          const w = Math.min(img.width, maxW);
          const h = Math.round(w * img.height / img.width);
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/jpeg', 0.88));
        };
        img.src = e.target.result;
      };
      r.readAsDataURL(file);
    });
  }

  async function _uploadToStorage(dataUrl, path) {
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const { data, error } = await getSb().storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
      if (error) { console.error('Storage upload error:', error); return null; }
      const { data: urlData } = getSb().storage.from(BUCKET).getPublicUrl(path);
      return urlData?.publicUrl || null;
    } catch(e) { console.error(e); return null; }
  }

  function _previewThumb(input) {
    const file = input.files[0];
    if (!file) return;
    _resize(file).then(url => {
      document.getElementById('pf-thumb-preview').innerHTML =
        `<img src="${url}" style="width:90px;height:90px;object-fit:cover;border-radius:8px;border:1px solid var(--accent);">`;
      document.getElementById('pf-thumb-url').value = url;
    });
  }

  function _previewExtraImgs(input) {
    const files = Array.from(input.files).slice(0, 6);
    const wrap = document.getElementById('pf-imgs-preview');
    const current = wrap.querySelectorAll('.thumb-item').length;
    const remaining = 6 - current;
    files.slice(0, remaining).forEach((file, i) => {
      _resize(file).then(url => {
        const div = document.createElement('div');
        div.className = 'thumb-item';
        div.dataset.url = url;
        div.innerHTML = `<img src="${url}"><button class="thumb-del" type="button" onclick="this.parentElement.remove()">✕</button>`;
        wrap.appendChild(div);
      });
    });
    if (files.length > remaining) toast(`최대 6장까지만 업로드 가능합니다. ${remaining}장만 추가됐습니다.`, 'error');
  }

  function _edCmd(cmd, val) {
    document.execCommand(cmd, false, val || null);
    document.getElementById('pf-editor')?.focus();
  }
  function _edInsertImg() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = async e => {
      toast('이미지 업로드 중...', 'info');
      const url = await _resizeAndUploadFile(e.target.files[0], `desc/${Date.now()}.jpg`);
      if (url) { document.execCommand('insertImage', false, url); toast('이미지 삽입 완료', 'success'); }
      else toast('이미지 업로드 실패', 'error');
    };
    input.click();
  }
  async function _resizeAndUploadFile(file, path) {
    const dataUrl = await _resize(file);
    return await _uploadToStorage(dataUrl, path);
  }

  async function _submitProduct(editId) {
    const cat  = document.getElementById('pf-cat')?.value;
    const name = document.getElementById('pf-name')?.value.trim();
    const price = parseInt(document.getElementById('pf-price')?.value||0);
    const discount_rate = parseInt(document.getElementById('pf-discount')?.value||0);
    const stock = parseInt(document.getElementById('pf-stock')?.value||0);
    const stock_alert = parseInt(document.getElementById('pf-alert')?.value||5);
    const is_free_ship = document.getElementById('pf-freeship')?.checked;
    const is_cargo = document.getElementById('pf-cargo')?.checked;
    const is_active = document.getElementById('pf-active')?.value === '1';
    const description = document.getElementById('pf-editor')?.innerHTML || '';

    if (!cat) { toast('카테고리를 선택해주세요.', 'error'); return; }
    if (!name) { toast('상품명을 입력해주세요.', 'error'); return; }
    if (!price || price <= 0) { toast('원가를 입력해주세요.', 'error'); return; }

    toast('상품 저장 중...', 'info');

    // 썸네일 업로드
    let thumbnail_url = document.getElementById('pf-thumb-url')?.value || '';
    if (thumbnail_url.startsWith('data:')) {
      thumbnail_url = await _uploadToStorage(thumbnail_url, `thumb/${Date.now()}.jpg`) || '';
    }

    const productData = {
      category_slug: cat, name, price, discount_rate,
      stock, stock_alert, is_free_ship, is_cargo, is_active,
      description, thumbnail_url,
      book_isbn: document.getElementById('pf-isbn')?.value || null,
      book_author: document.getElementById('pf-author')?.value || null,
      book_publisher: document.getElementById('pf-publisher')?.value || null,
      book_pub_date: document.getElementById('pf-pubdate')?.value || null,
    };

    let productId = editId || null;
    if (editId) {
      const { error } = await getSb().from('mall_products').update(productData).eq('id', editId);
      if (error) { toast('수정 실패: ' + error.message, 'error'); return; }
    } else {
      const { data, error } = await getSb().from('mall_products').insert(productData).select().single();
      if (error) { toast('등록 실패: ' + error.message, 'error'); return; }
      productId = data?.id;
    }

    if (!productId) { toast('상품 ID를 가져오지 못했습니다.', 'error'); return; }

    // 추가 이미지 업로드
    const imgPreviews = document.querySelectorAll('#pf-imgs-preview .thumb-item');
    if (imgPreviews.length > 0) {
      await getSb().from('mall_product_images').delete().eq('product_id', productId);
      for (let i = 0; i < imgPreviews.length; i++) {
        let url = imgPreviews[i].dataset.url;
        if (url.startsWith('data:')) {
          url = await _uploadToStorage(url, `product/${productId}_${i}_${Date.now()}.jpg`) || url;
        }
        if (url) await getSb().from('mall_product_images').insert({ product_id: productId, url, sort_order: i });
      }
    }

    // PC 부품
    if (cat === 'computer') {
      await getSb().from('mall_pc_parts').delete().eq('product_id', productId);
      const rows = document.querySelectorAll('#pc-parts-editor > div');
      for (const row of rows) {
        const partType = row.querySelector('[name=part-type]')?.value;
        const partName = row.querySelector('[name=part-name]')?.value?.trim();
        const delta = parseInt(row.querySelector('[name=part-delta]')?.value||0);
        const isDef = row.querySelector('[name=part-default]')?.checked;
        if (partType && partName) {
          await getSb().from('mall_pc_parts').insert({ product_id: productId, part_type: partType, name: partName, price_delta: delta, is_default: isDef });
        }
      }
    }

    // 패션 옵션
    if (cat === 'fashion') {
      await getSb().from('mall_fashion_options').delete().eq('product_id', productId);
      const rows = document.querySelectorAll('#fashion-opts-editor > div');
      for (const row of rows) {
        const size  = row.querySelector('[name=fopt-size]')?.value?.trim();
        const color = row.querySelector('[name=fopt-color]')?.value?.trim();
        const hex   = row.querySelector('[name=fopt-hex]')?.value;
        const stk   = parseInt(row.querySelector('[name=fopt-stock]')?.value||0);
        const delta = parseInt(row.querySelector('[name=fopt-delta]')?.value||0);
        if (size || color) await getSb().from('mall_fashion_options').insert({ product_id: productId, size, color, color_hex: hex, stock: stk, price_delta: delta });
      }
    }

    toast(editId ? '✅ 상품이 수정됐습니다.' : '✅ 상품이 등록됐습니다.', 'success');
    nav('products', null);
  }

  async function _editProduct(id) {
    toast('상품 정보 불러오는 중...', 'info');
    const [{ data: p }, { data: imgs }, { data: parts }, { data: fashOpts }] = await Promise.all([
      getSb().from('mall_products').select('*').eq('id', id).single(),
      getSb().from('mall_product_images').select('*').eq('product_id', id).order('sort_order'),
      getSb().from('mall_pc_parts').select('*').eq('product_id', id).order('sort_order'),
      getSb().from('mall_fashion_options').select('*').eq('product_id', id),
    ]);
    const el = document.getElementById('admin-content');
    _pageProductForm(el, { ...p, parts: parts||[], fashOpts: fashOpts||[] });

    // 기존 추가 이미지 미리보기
    if (imgs?.length) {
      const wrap = document.getElementById('pf-imgs-preview');
      imgs.forEach(img => {
        const div = document.createElement('div');
        div.className = 'thumb-item';
        div.dataset.url = img.url;
        div.innerHTML = `<img src="${img.url}"><button class="thumb-del" type="button" onclick="this.parentElement.remove()">✕</button>`;
        wrap?.appendChild(div);
      });
    }
  }

  async function _deleteProduct(id, name) {
    if (!confirm(`"${name}" 상품을 삭제하시겠습니까?\n관련 이미지·옵션도 모두 삭제됩니다.`)) return;
    const { error } = await getSb().from('mall_products').delete().eq('id', id);
    if (error) { toast('삭제 실패: ' + error.message, 'error'); return; }
    toast('✅ 삭제됐습니다.', 'success');
    nav('products', null);
  }

  // ════════════════════════════════════════════════════════════
  // 주문 관리
  // ════════════════════════════════════════════════════════════
  async function _pageOrders(el, offset=0, limit=20, search='', statusFilter='') {
    let q = getSb().from('mall_orders').select('*, mall_order_items(*)', {count:'exact'}).order('created_at',{ascending:false}).range(offset, offset+limit-1);
    if (statusFilter) q = q.eq('status', statusFilter);
    const { data: orders, count } = await q;

    el.innerHTML = `
    <div class="ap-hd"><div><h2>📋 전체 주문</h2><p>주문 상태 변경, 운송장 입력을 합니다.</p></div></div>
    <div class="search-row">
      <input id="ord-search" placeholder="주문번호, 이름, 주소 검색..." style="flex:1;max-width:280px;" onkeydown="if(event.key==='Enter')AdminPanel._searchOrders()">
      <select id="ord-status">
        <option value="">전체 상태</option>
        ${['paid','preparing','shipping','delivered','confirmed','cancelled'].map(s=>`<option value="${s}">${_statusLabel(s)}</option>`).join('')}
      </select>
      <select id="ord-limit" onchange="AdminPanel._pageOrders(document.getElementById('admin-content'))">
        ${[10,20,30,50,100].map(n=>`<option value="${n}" ${n===limit?'selected':''}>${n}개씩</option>`).join('')}
      </select>
      <button class="sbtn-primary" onclick="AdminPanel._searchOrders()">검색</button>
    </div>
    <div class="tbl-wrap">
      <table class="atbl">
        <thead><tr><th>주문번호</th><th>상품</th><th>받는분</th><th>주소</th><th>금액</th><th>상태</th><th>운송장</th><th>날짜</th><th>관리</th></tr></thead>
        <tbody>${(orders||[]).length===0?`<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-dim);">주문이 없습니다.</td></tr>`:
          (orders||[]).map(o=>{
            const items = o.mall_order_items||[];
            const itemNames = items.map(i=>i.product_name).join(', ');
            return `<tr>
              <td style="font-size:.75rem;font-family:monospace;">${o.order_no}</td>
              <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.82rem;">${itemNames}</td>
              <td><div style="font-weight:500;">${o.receiver_name}</div><div style="font-size:.72rem;color:var(--text-dim);">${o.receiver_phone}</div></td>
              <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.78rem;color:var(--text-dim);">${o.address}</td>
              <td style="font-weight:700;">₩${_fmt(o.final_price)}</td>
              <td>
                <select class="fselect" style="padding:4px 6px;font-size:.75rem;" onchange="AdminPanel._updateStatus('${o.id}',this.value)">
                  ${['paid','preparing','shipping','delivered','confirmed','cancelled'].map(s=>`<option value="${s}" ${o.status===s?'selected':''}>${_statusLabel(s)}</option>`).join('')}
                </select>
              </td>
              <td>
                ${o.tracking_no
                  ? `<div style="font-size:.75rem;font-family:monospace;">${o.tracking_no}</div><a href="${o.courier_url||'#'}" target="_blank" style="font-size:.72rem;color:var(--accent3);">📍추적</a>`
                  : '<span style="color:var(--text-dim);font-size:.78rem;">미입력</span>'}
                <button class="sbtn-primary sbtn-sm" onclick="AdminPanel._inputTracking('${o.id}')" style="margin-top:3px;display:block;">운송장</button>
              </td>
              <td style="font-size:.75rem;">${_date(o.created_at)}</td>
              <td><button class="sbtn-green sbtn-sm" onclick="AdminPanel._viewOrder('${o.id}')">상세</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div class="pg-wrap">
      <div style="font-size:.78rem;color:var(--text-dim);">총 ${count||0}건</div>
      <div class="pg-btns">${_buildPagination(offset, limit, count||0)}</div>
    </div>`;
  }

  function _buildPagination(offset, limit, total) {
    const totalPages = Math.ceil(total / limit);
    const currentPage = Math.floor(offset / limit);
    let html = '';
    for (let i = 0; i < Math.min(totalPages, 10); i++) {
      html += `<button class="pg-btn ${i===currentPage?'active':''}" onclick="AdminPanel._pageOrders(document.getElementById('admin-content'),${i*limit},${limit})">${i+1}</button>`;
    }
    return html;
  }

  function _searchOrders() {
    const search = document.getElementById('ord-search')?.value||'';
    const status = document.getElementById('ord-status')?.value||'';
    const limit = parseInt(document.getElementById('ord-limit')?.value||20);
    _pageOrders(document.getElementById('admin-content'), 0, limit, search, status);
  }

  async function _updateStatus(orderId, status) {
    await getSb().from('mall_orders').update({ status }).eq('id', orderId);
    toast('✅ 상태가 변경됐습니다.', 'success');
    _loadBadges();
  }

  async function _inputTracking(orderId) {
    const no = prompt('운송장 번호를 입력하세요:');
    if (!no) return;
    await getSb().from('mall_orders').update({ tracking_no: no, status: 'shipping' }).eq('id', orderId);
    toast('✅ 운송장이 등록됐습니다.', 'success');
    _renderPage('orders');
  }

  async function _viewOrder(orderId) {
    const { data: o } = await getSb().from('mall_orders').select('*, mall_order_items(*)').eq('id', orderId).single();
    if (!o) return;
    const modal = document.createElement('div');
    modal.className = 'order-detail-modal';
    modal.onclick = e => { if(e.target===modal) modal.remove(); };
    modal.innerHTML = `
    <div class="order-detail-box">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 style="font-size:1rem;font-weight:700;">주문 상세</h3>
        <button onclick="this.closest('.order-detail-modal').remove()" style="background:none;border:none;color:var(--text-dim);font-size:1.3rem;cursor:pointer;">✕</button>
      </div>
      <table style="width:100%;font-size:.82rem;border-collapse:collapse;">
        <tr><td style="color:var(--text-dim);padding:5px 0;width:90px;">주문번호</td><td style="font-family:monospace;font-weight:700;">${o.order_no}</td></tr>
        <tr><td style="color:var(--text-dim);padding:5px 0;">상태</td><td><span style="color:${_statusColor(o.status)};font-weight:700;">${_statusLabel(o.status)}</span></td></tr>
        <tr><td style="color:var(--text-dim);padding:5px 0;">받는분</td><td>${o.receiver_name} / ${o.receiver_phone}</td></tr>
        <tr><td style="color:var(--text-dim);padding:5px 0;">주소</td><td>${o.address} ${o.address_detail||''}</td></tr>
        <tr><td style="color:var(--text-dim);padding:5px 0;">배송메모</td><td>${o.memo||'—'}</td></tr>
        <tr><td style="color:var(--text-dim);padding:5px 0;">운송장</td><td>${o.tracking_no||'미입력'} ${o.courier_name?`(${o.courier_name})`:''}</td></tr>
        <tr><td style="color:var(--text-dim);padding:5px 0;">원산지</td><td>${o.origin_snapshot||'—'}</td></tr>
        <tr><td style="color:var(--text-dim);padding:5px 0;">주문일</td><td>${_datetime(o.created_at)}</td></tr>
      </table>
      <div style="margin:14px 0;border-top:1px solid var(--border);padding-top:12px;">
        <div style="font-size:.82rem;font-weight:700;margin-bottom:8px;">주문 상품</div>
        ${(o.mall_order_items||[]).map(i=>`
        <div style="display:flex;justify-content:space-between;font-size:.82rem;padding:5px 0;border-bottom:1px solid rgba(30,58,95,.3);">
          <div>${i.product_name} <span style="color:var(--text-dim);">x${i.quantity}</span></div>
          <div style="font-weight:700;">₩${_fmt(i.subtotal||i.unit_price*i.quantity)}</div>
        </div>`).join('')}
      </div>
      <div style="font-size:.85rem;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="color:var(--text-dim);">상품 합계</span><span>₩${_fmt(o.total_price)}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="color:var(--text-dim);">배송비</span><span>${o.ship_fee===0?'무료':`₩${_fmt(o.ship_fee)}`}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:700;font-size:1rem;border-top:1px solid var(--border);padding-top:8px;margin-top:4px;"><span>최종 결제</span><span style="color:var(--accent);">₩${_fmt(o.final_price)}</span></div>
      </div>
    </div>`;
    document.body.appendChild(modal);
  }

  // ════════════════════════════════════════════════════════════
  // 반품 관리
  // ════════════════════════════════════════════════════════════
  async function _pageReturns(el) {
    const { data } = await getSb().from('mall_orders').select('*').in('status',['return_requested','return_reviewing','return_shipping','return_completed']).order('updated_at',{ascending:false});
    el.innerHTML = `
    <div class="ap-hd"><div><h2>🔄 반품 관리</h2><p>반품 요청 처리, 반품배송비 청구, 반품 완료를 관리합니다.</p></div></div>
    ${(data||[]).length===0?'<div style="text-align:center;padding:60px;color:var(--text-dim);">반품 요청이 없습니다.</div>':
    `<div class="tbl-wrap">
      <table class="atbl">
        <thead><tr><th>주문번호</th><th>고객</th><th>반품사유</th><th>고객 운송장</th><th>상태</th><th>반품배송비</th><th>처리</th></tr></thead>
        <tbody>${(data||[]).map(o=>`
        <tr>
          <td style="font-size:.75rem;font-family:monospace;">${o.order_no}</td>
          <td>${o.receiver_name}<br><span style="font-size:.72rem;color:var(--text-dim);">${o.receiver_phone}</span></td>
          <td style="max-width:160px;font-size:.8rem;">${o.return_reason||'—'}</td>
          <td style="font-size:.8rem;">${o.return_tracking_no||'<span style="color:var(--text-dim);">미입력</span>'}</td>
          <td><span class="status-badge" style="background:${_statusColor(o.status)}22;color:${_statusColor(o.status)};">${_statusLabel(o.status)}</span></td>
          <td>
            <div style="font-size:.8rem;margin-bottom:4px;">
              ${o.return_fee>0?`₩${_fmt(o.return_fee)} ${o.return_fee_paid?'<span style="color:var(--accent3);">결제완료</span>':'<span style="color:var(--accent2);">미결제</span>'}`:'미설정'}
            </div>
            ${!o.return_fee_paid?`
            <div style="display:flex;gap:4px;flex-wrap:wrap;">
              <input id="rf-${o.id}" type="number" style="width:85px;background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:5px;padding:3px 6px;font-size:.75rem;" value="${o.return_fee||_settings.return_fee||5000}" placeholder="금액">
              <button class="sbtn-gold sbtn-sm" onclick="AdminPanel._chargeReturn('${o.id}')">청구</button>
              <button class="sbtn-green sbtn-sm" onclick="AdminPanel._freeReturn('${o.id}')">무료</button>
            </div>`:''}
          </td>
          <td>
            ${(o.return_fee_paid||o.return_fee===0)&&o.status!=='return_completed'?`
              <button class="sbtn-primary sbtn-sm" onclick="AdminPanel._completeReturn('${o.id}')">반품 완료</button>`:''}
          </td>
        </tr>`).join('')}
        </tbody>
      </table>
    </div>`}`;
  }

  async function _chargeReturn(id) {
    const fee = parseInt(document.getElementById(`rf-${id}`)?.value||0);
    if (!fee) { toast('금액을 입력해주세요.', 'error'); return; }
    await getSb().from('mall_orders').update({ return_fee: fee }).eq('id', id);
    toast(`✅ ₩${_fmt(fee)} 반품배송비가 고객에게 청구됐습니다.`, 'success');
    _renderPage('returns');
  }
  async function _freeReturn(id) {
    await getSb().from('mall_orders').update({ return_fee: 0, return_fee_paid: true }).eq('id', id);
    toast('✅ 무료 반품으로 처리됐습니다.', 'success');
    _renderPage('returns');
  }
  async function _completeReturn(id) {
    const { data: o } = await getSb().from('mall_orders').select('*, mall_order_items(*)').eq('id', id).single();
    for (const item of (o?.mall_order_items||[])) {
      const { data: p } = await getSb().from('mall_products').select('stock,sold_count').eq('id', item.product_id).single();
      if (p) await getSb().from('mall_products').update({ stock: (p.stock||0) + item.quantity, sold_count: Math.max(0,(p.sold_count||0)-item.quantity) }).eq('id', item.product_id);
    }
    await getSb().from('mall_orders').update({ status: 'return_completed' }).eq('id', id);
    toast('✅ 반품 완료 처리됐습니다. 재고가 복구됐습니다.', 'success');
    _renderPage('returns');
    _loadBadges();
  }

  // ════════════════════════════════════════════════════════════
  // 1:1 문의
  // ════════════════════════════════════════════════════════════
  async function _pageInquiries(el) {
    const { data } = await getSb().from('mall_inquiries').select('*').eq('is_visible',true).order('created_at',{ascending:false});
    el.innerHTML = `
    <div class="ap-hd"><div><h2>❓ 1:1 문의</h2><p>고객 문의에 답변합니다. 미답변 항목이 배지로 표시됩니다.</p></div></div>
    ${(data||[]).length===0?'<div style="text-align:center;padding:60px;color:var(--text-dim);">문의가 없습니다.</div>':
    (data||[]).map(q=>`
    <div class="form-sec" style="margin-bottom:12px;${!q.answer?'border-color:var(--accent2);':''}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
        <span style="font-size:.82rem;font-weight:700;">${q.nickname||'익명'}</span>
        <span style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:2px 8px;font-size:.72rem;">${q.type||'일반'}</span>
        ${!q.answer?'<span style="color:var(--accent2);font-size:.75rem;font-weight:700;">● 미답변</span>':'<span style="color:var(--accent3);font-size:.75rem;">● 답변완료</span>'}
        <span style="font-size:.72rem;color:var(--text-dim);margin-left:auto;">${_datetime(q.created_at)}</span>
      </div>
      <div style="font-weight:600;font-size:.88rem;margin-bottom:4px;">${q.title}</div>
      <div style="font-size:.84rem;color:var(--text-dim);line-height:1.6;margin-bottom:10px;">${q.content}</div>
      ${q.answer?`<div style="background:rgba(0,212,255,.06);border-left:3px solid var(--accent);padding:8px 12px;border-radius:0 6px 6px 0;font-size:.83rem;">💬 ${q.answer}</div>`:`
      <div style="display:flex;gap:8px;">
        <input class="finput" id="ans-${q.id}" placeholder="답변 내용을 입력하세요..." style="flex:1;">
        <button class="sbtn-primary" onclick="AdminPanel._answerInquiry('${q.id}')">답변 등록</button>
        <button class="sbtn-red" onclick="AdminPanel._hideInquiry('${q.id}')">숨김</button>
      </div>`}
    </div>`).join('')}`;
  }

  async function _answerInquiry(id) {
    const ans = document.getElementById(`ans-${id}`)?.value.trim();
    if (!ans) { toast('답변 내용을 입력해주세요.', 'error'); return; }
    await getSb().from('mall_inquiries').update({ answer: ans, answered_at: new Date().toISOString() }).eq('id', id);
    toast('✅ 답변이 등록됐습니다.', 'success');
    _renderPage('inquiries');
    _loadBadges();
  }
  async function _hideInquiry(id) {
    await getSb().from('mall_inquiries').update({ is_visible: false }).eq('id', id);
    toast('문의가 숨겨졌습니다.', 'success');
    _renderPage('inquiries');
  }

  // ════════════════════════════════════════════════════════════
  // 후기 관리
  // ════════════════════════════════════════════════════════════
  async function _pageReviews(el) {
    const { data } = await getSb().from('mall_reviews').select('*, mall_products(name)').order('created_at',{ascending:false});
    el.innerHTML = `
    <div class="ap-hd"><div><h2>⭐ 후기 관리</h2><p>후기를 노출/숨김 처리합니다.</p></div></div>
    <div class="tbl-wrap">
      <table class="atbl">
        <thead><tr><th>상품</th><th>작성자</th><th>별점</th><th>내용</th><th>상태</th><th>날짜</th><th>관리</th></tr></thead>
        <tbody>${(data||[]).length===0?`<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-dim);">후기가 없습니다.</td></tr>`:
          (data||[]).map(r=>`
          <tr>
            <td style="font-size:.8rem;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.mall_products?.name||'—'}</td>
            <td>${r.nickname||'익명'}</td>
            <td style="color:var(--gold);">${'⭐'.repeat(r.rating||0)}</td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.82rem;">${r.content||''}</td>
            <td><span style="color:${r.is_visible?'var(--accent3)':'var(--text-dim)'};">${r.is_visible?'●노출':'●숨김'}</span></td>
            <td style="font-size:.75rem;">${_date(r.created_at)}</td>
            <td><button class="sbtn-${r.is_visible?'red':'green'} sbtn-sm" onclick="AdminPanel._toggleReview('${r.id}',${!r.is_visible})">${r.is_visible?'숨김':'노출'}</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }
  async function _toggleReview(id, visible) {
    await getSb().from('mall_reviews').update({ is_visible: visible }).eq('id', id);
    _renderPage('reviews');
  }

  // ════════════════════════════════════════════════════════════
  // 블랙리스트
  // ════════════════════════════════════════════════════════════
  async function _pageBlacklist(el) {
    const { data } = await getSb().from('mall_blacklist').select('*, user_profiles(nickname,phone)').order('created_at',{ascending:false});
    el.innerHTML = `
    <div class="ap-hd"><div><h2>🚫 블랙리스트</h2><p>악성 구매자를 관리합니다. 블랙리스트 등록 시 쇼핑몰 접근이 제한됩니다.</p></div></div>
    <div class="form-sec">
      <h3>➕ 블랙리스트 추가</h3>
      <div class="frow">
        <div class="fg">
          <label>유저 ID</label>
          <input class="finput" id="bl-uid" placeholder="Supabase auth.users ID (UUID)">
        </div>
        <div class="fg">
          <label>차단 사유</label>
          <input class="finput" id="bl-reason" placeholder="예: 허위 반품 신청">
        </div>
      </div>
      <button class="sbtn-red" onclick="AdminPanel._addBlacklist()">🚫 블랙리스트 추가</button>
    </div>
    <div class="tbl-wrap">
      <table class="atbl">
        <thead><tr><th>닉네임</th><th>전화</th><th>사유</th><th>등록일</th><th>관리</th></tr></thead>
        <tbody>${(data||[]).length===0?`<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-dim);">블랙리스트가 없습니다.</td></tr>`:
          (data||[]).map(b=>`
          <tr>
            <td>${b.user_profiles?.nickname||b.user_id?.substring(0,8)+'...'}</td>
            <td>${b.user_profiles?.phone||'—'}</td>
            <td>${b.reason||'—'}</td>
            <td>${_date(b.created_at)}</td>
            <td><button class="sbtn-green sbtn-sm" onclick="AdminPanel._removeBlacklist(${b.id})">해제</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }
  async function _addBlacklist() {
    const uid = document.getElementById('bl-uid')?.value.trim();
    const reason = document.getElementById('bl-reason')?.value.trim();
    if (!uid) { toast('유저 ID를 입력해주세요.', 'error'); return; }
    await getSb().from('mall_blacklist').insert({ user_id: uid, reason });
    toast('✅ 블랙리스트에 추가됐습니다.', 'success');
    _renderPage('blacklist');
  }
  async function _removeBlacklist(id) {
    await getSb().from('mall_blacklist').delete().eq('id', id);
    toast('✅ 블랙리스트에서 해제됐습니다.', 'success');
    _renderPage('blacklist');
  }

  // ════════════════════════════════════════════════════════════
  // 배송·원산지 설정
  // ════════════════════════════════════════════════════════════
  function _pageSettingsShip(el) {
    const s = _settings;
    el.innerHTML = `
    <div class="ap-hd"><div><h2>🚚 배송·원산지 설정</h2><p>여기서 설정한 내용은 <strong>모든 상품 상세 페이지 최하단에 자동 표시</strong>됩니다. 변경 즉시 전체 상품에 반영됩니다.</p></div></div>

    <div class="form-sec" style="border-color:rgba(0,212,255,.2);">
      <h3>📋 법적 표기 (한국 전자상거래법 필수)</h3>
      <div class="frow">
        <div class="fg">
          <label>원산지 *</label>
          <input class="finput" id="set-origin" value="${s.origin||'대한민국'}" placeholder="예: 대한민국, 중국, 베트남">
          <div class="hint">전자상거래법상 필수 표기 항목입니다</div>
        </div>
        <div class="fg">
          <label>택배사 *</label>
          <input class="finput" id="set-courier" value="${s.courier||'CJ대한통운'}" placeholder="예: CJ대한통운, 한진택배">
        </div>
      </div>
      <div class="fg">
        <label>배송조회 URL</label>
        <input class="finput" id="set-couri-url" value="${s.courier_url||''}" placeholder="https://...">
        <div class="hint">고객이 운송장으로 배송 추적할 때 사용하는 링크</div>
      </div>
      <div class="frow">
        <div class="fg">
          <label>A/S 전화번호</label>
          <input class="finput" id="set-as-phone" value="${s.as_phone||''}" placeholder="02-000-0000">
        </div>
        <div class="fg">
          <label>반품·교환 주소</label>
          <input class="finput" id="set-as-addr" value="${s.as_address||''}" placeholder="서울시 ...">
        </div>
      </div>
    </div>

    <div class="form-sec">
      <h3>🚛 배송비 설정</h3>
      <div class="frow">
        <div class="fg">
          <label>기본 배송비 (원)</label>
          <input class="finput" id="set-ship-fee" type="number" value="${s.ship_fee||3000}">
          <div class="hint">상품에서 '무료배송' 체크 해제 시 이 금액 부과</div>
        </div>
        <div class="fg">
          <label>무료배송 기준 금액 (원)</label>
          <input class="finput" id="set-free-min" type="number" value="${s.free_ship_min||50000}">
          <div class="hint">이 금액 이상 주문 시 무료. 0이면 항상 무료배송</div>
        </div>
      </div>
    </div>

    <div class="form-sec">
      <h3>🔄 반품 설정</h3>
      <div class="frow">
        <div class="fg">
          <label>기본 반품배송비 (원)</label>
          <input class="finput" id="set-ret-fee" type="number" value="${s.return_fee||5000}">
          <div class="hint">일반 상품 반품 시 기본 청구 금액</div>
        </div>
        <div class="fg">
          <label>화물 반품배송비 (원)</label>
          <input class="finput" id="set-ret-cargo" type="number" value="${s.return_fee_cargo||10000}">
          <div class="hint">화물 상품으로 표시된 경우 적용</div>
        </div>
      </div>
      <div class="fg" style="max-width:300px;">
        <label>반품 가능 기간 (배송완료 후 일수)</label>
        <input class="finput" id="set-ret-period" type="number" value="${s.return_period||3}" min="1">
        <div class="hint">이 기간 이내에만 고객에게 반품 요청 버튼이 표시됩니다</div>
      </div>
    </div>

    <div class="form-sec" style="border-color:rgba(255,215,0,.3);">
      <h3>👁️ 현재 설정 미리보기 (상품 상세 하단)</h3>
      <table style="width:100%;font-size:.85rem;border-collapse:collapse;">
        ${[['원산지',s.origin||'대한민국'],['택배사',s.courier||'CJ대한통운'],['배송비',`₩${_fmt(s.ship_fee||3000)} (${_fmt(s.free_ship_min||50000)}원 이상 무료)`],['A/S',s.as_phone||'—'],['반품교환',s.as_address||'—'],['반품배송비',`일반 ₩${_fmt(s.return_fee||5000)} / 화물 ₩${_fmt(s.return_fee_cargo||10000)}`],['반품기간',`배송완료 후 ${s.return_period||3}일 이내`]].map(([k,v])=>`
        <tr style="border-bottom:1px solid rgba(30,58,95,.3);">
          <td style="color:var(--text-dim);padding:7px 0;width:100px;font-weight:500;">${k}</td>
          <td style="padding:7px 0;">${v}</td>
        </tr>`).join('')}
      </table>
    </div>

    <button class="sbtn-primary" onclick="AdminPanel._saveShipSettings()" style="padding:11px 28px;">💾 저장 — 전체 상품에 즉시 반영</button>`;
  }

  async function _saveShipSettings() {
    const pairs = [['origin','set-origin'],['courier','set-courier'],['courier_url','set-couri-url'],['as_phone','set-as-phone'],['as_address','set-as-addr'],['ship_fee','set-ship-fee'],['free_ship_min','set-free-min'],['return_fee','set-ret-fee'],['return_fee_cargo','set-ret-cargo'],['return_period','set-ret-period']];
    for (const [key, inputId] of pairs) {
      const val = document.getElementById(inputId)?.value;
      if (val !== undefined) {
        await getSb().from('mall_settings').update({ value: val, updated_at: new Date().toISOString() }).eq('key', key);
        _settings[key] = val;
      }
    }
    toast('✅ 배송·원산지 설정이 저장됐습니다. 전체 상품에 즉시 반영됩니다.', 'success');
    _pageSettingsShip(document.getElementById('admin-content'));
  }

  // ════════════════════════════════════════════════════════════
  // 쇼핑몰 설정
  // ════════════════════════════════════════════════════════════
  function _pageSettingsShop(el) {
    el.innerHTML = `
    <div class="ap-hd"><div><h2>🏪 쇼핑몰 설정</h2><p>쇼핑몰 전반적인 기본 설정을 관리합니다.</p></div></div>
    <div class="form-sec">
      <h3>📢 상단 공지 배너</h3>
      <div class="fg">
        <label>공지 메시지</label>
        <input class="finput" id="set-notice" value="${_settings.shop_notice||''}" placeholder="예: 🎉 설 연휴 배송 안내 — 1/28~2/2 배송 지연될 수 있습니다.">
        <div class="hint">입력 시 쇼핑몰 상단에 공지 배너가 표시됩니다. 비워두면 배너가 숨겨집니다.</div>
      </div>
      <button class="sbtn-primary" onclick="AdminPanel._saveShopSettings()">💾 저장</button>
    </div>`;
  }

  async function _saveShopSettings() {
    const val = document.getElementById('set-notice')?.value || '';
    await getSb().from('mall_settings').update({ value: val }).eq('key', 'shop_notice');
    _settings.shop_notice = val;
    toast('✅ 설정이 저장됐습니다.', 'success');
  }

  // ── 공개 API ─────────────────────────────────────────────────
  return {
    init, nav, _renderPage,
    _onCatChange, _calcSale,
    _addPartRow, _addFashionOpt,
    _previewThumb, _previewExtraImgs,
    _edCmd, _edInsertImg,
    _submitProduct, _editProduct, _deleteProduct,
    _searchProducts, _pageOrders,
    _updateStatus, _inputTracking, _viewOrder,
    _searchOrders,
    _chargeReturn, _freeReturn, _completeReturn,
    _answerInquiry, _hideInquiry,
    _toggleReview,
    _addBlacklist, _removeBlacklist,
    _saveShipSettings, _saveShopSettings,
  };
})();

// Mall.init()은 mall.js의 DOMContentLoaded에서 실행됨
