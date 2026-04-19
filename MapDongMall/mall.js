// ════════════════════════════════════════════════════════════════
// MapDong Mall — mall.js  v1.0
// index.html과 분리된 독립 파일
// ════════════════════════════════════════════════════════════════

'use strict';

// ── Supabase 설정 (index.html과 동일한 키 사용) ──────────────
const MALL_SB_URL = 'https://emgsueepzioudqnitkyn.supabase.co';
const MALL_SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZ3N1ZWVwemlvdWRxbml0a3luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5ODkwNzQsImV4cCI6MjA4NjU2NTA3NH0.epR1k3MVh0MfZejFh9VflCNOS8Uz8EuCZlez5OBMz3s';
const MALL_STORAGE_BUCKET = 'mall-images';

const sb = window.supabase.createClient(MALL_SB_URL, MALL_SB_KEY);

// ── 전역 상태 ─────────────────────────────────────────────────
const Mall = (() => {
  let _user = null;       // auth.users
  let _profile = null;    // user_profiles
  let _cart = [];         // 장바구니 (로컬 캐시)
  let _settings = {};     // mall_settings
  let _currentCat = 'all';
  let _searchQuery = '';
  let _tossWidget = null;
  let _tossOrderId = null;
  let _searchTimer = null;

  // ── 초기화 ──────────────────────────────────────────────────
  async function init() {
    await _loadSession();
    await _loadSettings();
    _applyNotice();
    await _loadCart();
    _updateCartBadge();
    _checkAdmin();
    showPage('main');
    await loadProducts();
  }

  async function _loadSession() {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { window.location.href = '../index.html'; return; }
      _user = session.user;

      // user_profiles 로드 (에러 상세 로깅)
      const { data, error } = await sb.from('user_profiles').select('*').eq('user_id', _user.id).single();
      if (error) {
        console.error('[Mall] user_profiles 로드 실패:', error);
      }
      _profile = data;
      console.log('[Mall] profile 로드:', _profile?.nickname, '| role:', _profile?.role);

      // 관리자는 프리미엄 체크 생략
      if (_profile?.role === 'admin') {
        console.log('[Mall] 관리자 계정 확인');
        return;
      }

      // 프리미엄 체크
      const now = new Date();
      const end = _profile?.premium_until ? new Date(_profile.premium_until) : null;
      if (!end || now > end) {
        toast('프리미엄 회원 전용 서비스입니다.', 'error');
        setTimeout(() => { window.location.href = '../index.html'; }, 2000);
      }
    } catch(e) {
      console.error('[Mall] _loadSession 오류:', e);
    }
  }

  async function _loadSettings() {
    const { data } = await sb.from('mall_settings').select('*');
    if (data) data.forEach(r => { _settings[r.key] = r.value; });
  }

  function _applyNotice() {
    const notice = _settings.shop_notice;
    const el = document.getElementById('mall-notice');
    if (notice && el) { el.textContent = notice; el.classList.add('show'); }
  }

  function _checkAdmin() {
    console.log('[Mall] _checkAdmin 실행 | role:', _profile?.role);
    const btn = document.getElementById('btn-admin-panel');
    if (_profile?.role === 'admin') {
      if (btn) btn.style.display = '';
      console.log('[Mall] 관리자 버튼 표시');
    } else {
      if (btn) btn.style.display = 'none';
    }
  }

  // ── 페이지 전환 ─────────────────────────────────────────────
  function showPage(page) {
    ['mall-main','page-detail','page-checkout','page-myorder','page-admin']
      .forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
    document.getElementById('mall-cats').style.display =
      page === 'main' ? '' : 'none';
    if (page === 'main') {
      document.getElementById('mall-main').style.display = '';
    } else {
      const el = document.getElementById(`page-${page}`);
      if (el) el.style.display = '';
    }
  }

  // ── 상품 목록 로드 ──────────────────────────────────────────
  async function loadProducts(cat, query) {
    const grid = document.getElementById('product-grid');
    grid.innerHTML = '<div class="loading">상품을 불러오는 중...</div>';

    let q = sb.from('mall_products').select('*').eq('is_active', true).order('created_at', { ascending: false });
    if (cat && cat !== 'all') q = q.eq('category_slug', cat);
    if (query) q = q.ilike('name', `%${query}%`);

    const { data, error } = await q;
    if (error || !data?.length) {
      grid.innerHTML = `<div class="empty-state"><div class="emoji">🛍️</div><p>상품이 없습니다.</p></div>`;
      return;
    }
    grid.innerHTML = data.map(p => _renderProductCard(p)).join('');
  }

  function _renderProductCard(p) {
    const sale = p.sale_price ?? p.price;
    const hasDiscount = p.discount_rate > 0;
    const isOut = p.stock <= 0;
    const freeShip = p.is_free_ship || parseInt(_settings.free_ship_min || '0') === 0;
    return `
    <div class="prod-card" onclick="Mall.openDetail('${p.id}')">
      ${p.thumbnail_url
        ? `<img class="prod-thumb" src="${p.thumbnail_url}" alt="${p.name}" loading="lazy">`
        : `<div class="prod-thumb-empty">${_catIcon(p.category_slug)}</div>`}
      <div class="prod-info">
        <div class="prod-name">${p.name}</div>
        <div class="prod-price-wrap">
          <span class="prod-sale-price">₩${_fmt(sale)}</span>
          ${hasDiscount ? `<span class="prod-origin-price">₩${_fmt(p.price)}</span>
          <span class="prod-discount">${p.discount_rate}%↓</span>` : ''}
        </div>
        <div class="prod-ship">${freeShip ? '🚚 무료배송' : `배송비 ₩${_fmt(_settings.ship_fee||3000)}`}</div>
        ${isOut ? '<div class="prod-out">품절</div>' : `<div class="prod-sold">누적판매 ${p.sold_count}개</div>`}
      </div>
    </div>`;
  }

  // ── 상품 상세 ───────────────────────────────────────────────
  async function openDetail(productId) {
    showPage('detail');
    const page = document.getElementById('page-detail');
    page.innerHTML = '<div class="loading">불러오는 중...</div>';

    const [{ data: p }, { data: imgs }, { data: parts }, { data: fashOpts }, { data: reviews }] = await Promise.all([
      sb.from('mall_products').select('*').eq('id', productId).single(),
      sb.from('mall_product_images').select('*').eq('product_id', productId).order('sort_order'),
      sb.from('mall_pc_parts').select('*').eq('product_id', productId).order('part_type').order('sort_order'),
      sb.from('mall_fashion_options').select('*').eq('product_id', productId),
      sb.from('mall_reviews').select('*').eq('product_id', productId).eq('is_visible', true).order('created_at', { ascending: false }).limit(20),
    ]);
    if (!p) { page.innerHTML = '<div class="empty-state"><p>상품을 찾을 수 없습니다.</p></div>'; return; }

    const allImgs = [p.thumbnail_url, ...(imgs || []).map(i => i.url)].filter(Boolean);
    const sale = p.sale_price ?? p.price;
    const freeShip = p.is_free_ship || parseInt(_settings.free_ship_min || '0') === 0;

    // PC 부품 그룹화
    const partGroups = {};
    (parts || []).forEach(pt => {
      if (!partGroups[pt.part_type]) partGroups[pt.part_type] = [];
      partGroups[pt.part_type].push(pt);
    });
    const partOrder = ['CPU','RAM','VGA','M/B','SSD','HDD','CASE','PSU','COOLER','OS'];

    // 패션 옵션
    const sizes = [...new Set((fashOpts || []).map(o => o.size).filter(Boolean))];
    const colors = [...new Set((fashOpts || []).map(o => o.color).filter(Boolean))];

    // 평균 별점
    const avgRating = reviews?.length
      ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null;

    page.innerHTML = `
    <div style="max-width:900px;margin:0 auto;padding:20px;">
      <div class="detail-back" onclick="Mall.goHome()">← 쇼핑 계속하기</div>
      <div class="detail-grid">
        <!-- 슬라이드쇼 -->
        <div>
          <div class="slide-wrap" id="slide-wrap" data-cur="0" data-imgs='${JSON.stringify(allImgs)}'>
            ${allImgs[0]
              ? `<img class="slide-img" id="slide-img" src="${allImgs[0]}" alt="">`
              : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:4rem;">${_catIcon(p.category_slug)}</div>`}
            ${allImgs.length > 1 ? `
            <button class="slide-btn prev" onclick="Mall.slideMove(-1)">‹</button>
            <button class="slide-btn next" onclick="Mall.slideMove(1)">›</button>
            <div class="slide-dots" id="slide-dots">
              ${allImgs.map((_, i) => `<div class="slide-dot ${i===0?'active':''}" onclick="Mall.slideTo(${i})"></div>`).join('')}
            </div>` : ''}
          </div>
        </div>
        <!-- 우측 정보 -->
        <div class="detail-right">
          <div class="detail-name">${p.name}</div>
          ${avgRating ? `<div style="font-size:.85rem;color:var(--gold);">⭐ ${avgRating} <span style="color:var(--text-dim);">(${reviews.length}개 후기)</span></div>` : ''}
          <div class="detail-price-block">
            <div class="dp-sale">₩${_fmt(sale)}</div>
            ${p.discount_rate > 0 ? `
            <div class="dp-origin">정가 ₩${_fmt(p.price)}</div>
            <div class="dp-discount">🏷️ ${p.discount_rate}% 할인</div>` : ''}
          </div>
          ${p.stock <= 0 ? '<div style="color:var(--accent2);font-weight:700;padding:8px 0;">⚠️ 품절된 상품입니다</div>' : ''}

          <!-- 패션 옵션 -->
          ${p.category_slug === 'fashion' && (sizes.length || colors.length) ? `
          <div class="option-section">
            <div class="option-title">옵션 선택 <span style="font-size:.72rem;color:var(--text-dim);">— 사이즈·색상을 선택해주세요</span></div>
            ${sizes.length ? `<div class="option-row" id="size-opts">${sizes.map(s => `<button class="opt-btn" data-size="${s}" onclick="Mall.selectSize('${s}',this)">${s}</button>`).join('')}</div>` : ''}
            ${colors.length ? `<div class="option-row" id="color-opts">${colors.map(c => {
              const co = fashOpts.find(o => o.color === c);
              return `<button class="opt-btn" data-color="${c}" onclick="Mall.selectColor('${c}',this)">${co?.color_hex ? `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${co.color_hex};margin-right:4px;vertical-align:middle;"></span>` : ''}${c}</button>`;
            }).join('')}</div>` : ''}
            <div class="opt-stock" id="opt-stock-info"></div>
          </div>` : ''}

          <!-- PC 부품 선택 -->
          ${p.category_slug === 'computer' && Object.keys(partGroups).length ? `
          <div class="pc-parts-wrap">
            <div class="option-title" style="margin-bottom:10px;">🖥️ 부품 선택 <span style="font-size:.72rem;color:var(--text-dim);">— 부품 변경 시 가격이 달라집니다</span></div>
            ${partOrder.filter(pt => partGroups[pt]).map(pt => `
            <div class="pc-part-row">
              <div class="pc-part-label">${pt}</div>
              <select class="pc-part-select" data-part="${pt}" onchange="Mall.updatePartPrice()">
                ${partGroups[pt].map(part => `<option value="${part.id}" data-delta="${part.price_delta}" ${part.is_default?'selected':''}>${part.name}${part.price_delta>0?` (+₩${_fmt(part.price_delta)})`:part.price_delta<0?` (-₩${_fmt(Math.abs(part.price_delta))})`:' (기본)'}</option>`).join('')}
              </select>
            </div>`).join('')}
            <div style="font-size:.8rem;color:var(--text-dim);margin-top:6px;">부품 옵션에 따라 최종 가격이 변경됩니다.</div>
          </div>` : ''}

          <!-- 수량 -->
          <div class="option-section">
            <div class="option-title">수량</div>
            <div class="qty-wrap">
              <button class="qty-btn" onclick="Mall.changeQty(-1)">−</button>
              <span class="qty-num" id="detail-qty">1</span>
              <button class="qty-btn" onclick="Mall.changeQty(1)">+</button>
              <span style="font-size:.78rem;color:var(--text-dim);margin-left:8px;">재고: ${p.stock}개</span>
            </div>
          </div>

          <!-- 최종 가격 -->
          <div style="background:rgba(0,212,255,.06);border:1px solid rgba(0,212,255,.2);border-radius:10px;padding:12px 16px;">
            <div style="font-size:.8rem;color:var(--text-dim);margin-bottom:3px;">최종 결제금액</div>
            <div style="font-size:1.4rem;font-weight:700;" id="detail-final-price">₩${_fmt(sale)}</div>
          </div>

          <!-- 구매 버튼 -->
          <div class="buy-btns">
            <button class="btn-cart" onclick="Mall.addToCart('${p.id}')" ${p.stock<=0?'disabled':''}>🛒 장바구니</button>
            <button class="btn-buy" onclick="Mall.buyNow('${p.id}')" ${p.stock<=0?'disabled':''}>⚡ 즉시 구매</button>
          </div>

          <!-- 배송/법적 정보 -->
          <div class="detail-meta">
            <div class="meta-row"><span class="meta-key">배송</span><span class="meta-val">${freeShip ? '무료배송' : `₩${_fmt(_settings.ship_fee||3000)}`}</span></div>
            <div class="meta-row"><span class="meta-key">원산지</span><span class="meta-val">${_settings.origin||'대한민국'}</span></div>
            <div class="meta-row"><span class="meta-key">택배사</span><span class="meta-val">${_settings.courier||'CJ대한통운'}</span></div>
            <div class="meta-row"><span class="meta-key">A/S</span><span class="meta-val">${_settings.as_phone||'-'}</span></div>
            <div class="meta-row"><span class="meta-key">반품교환</span><span class="meta-val">${_settings.as_address||'-'}</span></div>
            ${p.category_slug==='book'&&p.book_author?`<div class="meta-row"><span class="meta-key">저자</span><span class="meta-val">${p.book_author}</span></div>`:``}
            ${p.category_slug==='book'&&p.book_publisher?`<div class="meta-row"><span class="meta-key">출판사</span><span class="meta-val">${p.book_publisher}</span></div>`:``}
          </div>
        </div>
      </div>

      <!-- 탭 -->
      <div class="detail-tabs">
        <div class="dtab active" onclick="Mall.switchDetailTab('desc',this)">상품 설명</div>
        <div class="dtab" onclick="Mall.switchDetailTab('review',this)">후기 ${reviews?.length||0}</div>
        <div class="dtab" onclick="Mall.switchDetailTab('inquiry',this)">문의</div>
      </div>
      <div class="detail-body">
        <div id="tab-desc">${p.description || '<p style="color:var(--text-dim);text-align:center;padding:40px;">등록된 상품 설명이 없습니다.</p>'}</div>
        <div id="tab-review" style="display:none;">
          ${reviews?.length ? reviews.map(r => `
          <div style="border-bottom:1px solid var(--border);padding:12px 0;">
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:5px;">
              <span style="font-size:.82rem;font-weight:500;">${r.nickname||'익명'}</span>
              <span style="color:var(--gold);font-size:.82rem;">${'⭐'.repeat(r.rating)}</span>
              <span style="font-size:.72rem;color:var(--text-dim);">${_dateStr(r.created_at)}</span>
            </div>
            <p style="font-size:.85rem;line-height:1.6;">${r.content||''}</p>
          </div>`).join('')
          : '<p style="color:var(--text-dim);text-align:center;padding:40px;">아직 후기가 없습니다.</p>'}
        </div>
        <div id="tab-inquiry" style="display:none;">
          <button onclick="Mall.openInquiry('${p.id}')" class="btn-add" style="margin-bottom:16px;">✍️ 문의하기</button>
          <div id="inquiry-list-${p.id}"></div>
        </div>
      </div>
    </div>`;

    // 드래그 슬라이드
    _initSlideTouch();
    // 현재 productId 저장
    window._mallDetailProductId = productId;
    window._mallDetailProduct = p;
    window._mallDetailFashOpts = fashOpts || [];
    window._mallDetailQty = 1;
    window._mallDetailPartDelta = 0;
    window._mallDetailSalePrice = sale;
  }

  // ── 슬라이드쇼 ─────────────────────────────────────────────
  function slideMove(dir) {
    const wrap = document.getElementById('slide-wrap');
    if (!wrap) return;
    const imgs = JSON.parse(wrap.dataset.imgs || '[]');
    let cur = parseInt(wrap.dataset.cur || '0');
    cur = (cur + dir + imgs.length) % imgs.length;
    slideTo(cur);
  }
  function slideTo(idx) {
    const wrap = document.getElementById('slide-wrap');
    if (!wrap) return;
    const imgs = JSON.parse(wrap.dataset.imgs || '[]');
    wrap.dataset.cur = idx;
    const img = document.getElementById('slide-img');
    if (img) { img.style.opacity = '0'; setTimeout(() => { img.src = imgs[idx]; img.style.opacity = '1'; }, 150); }
    document.querySelectorAll('.slide-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
  }
  function _initSlideTouch() {
    const wrap = document.getElementById('slide-wrap');
    if (!wrap) return;
    let startX = 0;
    wrap.addEventListener('touchstart', e => { startX = e.touches[0].clientX; });
    wrap.addEventListener('touchend', e => {
      const diff = startX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 40) slideMove(diff > 0 ? 1 : -1);
    });
    wrap.addEventListener('mousedown', e => { startX = e.clientX; });
    wrap.addEventListener('mouseup', e => {
      const diff = startX - e.clientX;
      if (Math.abs(diff) > 40) slideMove(diff > 0 ? 1 : -1);
    });
  }

  // ── 옵션 선택 ───────────────────────────────────────────────
  function selectSize(size, btn) {
    document.querySelectorAll('#size-opts .opt-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    window._mallSelectedSize = size;
    _updateFashionStock();
  }
  function selectColor(color, btn) {
    document.querySelectorAll('#color-opts .opt-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    window._mallSelectedColor = color;
    _updateFashionStock();
  }
  function _updateFashionStock() {
    const opts = window._mallDetailFashOpts || [];
    const size = window._mallSelectedSize;
    const color = window._mallSelectedColor;
    const matched = opts.find(o => (!size || o.size === size) && (!color || o.color === color));
    const info = document.getElementById('opt-stock-info');
    if (info && matched) {
      info.textContent = matched.stock > 0 ? `재고: ${matched.stock}개` : '품절';
      info.style.color = matched.stock > 0 ? 'var(--accent3)' : 'var(--accent2)';
    }
  }

  function updatePartPrice() {
    let delta = 0;
    document.querySelectorAll('.pc-part-select').forEach(sel => {
      const opt = sel.selectedOptions[0];
      delta += parseInt(opt?.dataset.delta || 0);
    });
    window._mallDetailPartDelta = delta;
    const base = window._mallDetailSalePrice || 0;
    const qty = window._mallDetailQty || 1;
    const final = (base + delta) * qty;
    const el = document.getElementById('detail-final-price');
    if (el) el.textContent = `₩${_fmt(final)}`;
  }

  function changeQty(dir) {
    const p = window._mallDetailProduct;
    let q = (window._mallDetailQty || 1) + dir;
    q = Math.max(1, Math.min(q, p?.stock || 99));
    window._mallDetailQty = q;
    document.getElementById('detail-qty').textContent = q;
    updatePartPrice();
  }

  function switchDetailTab(tab, el) {
    ['desc','review','inquiry'].forEach(t => {
      const el = document.getElementById(`tab-${t}`);
      if (el) el.style.display = t === tab ? '' : 'none';
    });
    document.querySelectorAll('.dtab').forEach(d => d.classList.remove('active'));
    if (el) el.classList.add('active');
    if (tab === 'inquiry') _loadInquiries(window._mallDetailProductId);
  }

  // ── 장바구니 ───────────────────────────────────────────────
  async function _loadCart() {
    if (!_user) return;
    const { data } = await sb.from('mall_cart').select('*').eq('user_id', _user.id);
    _cart = data || [];
  }
  async function addToCart(productId) {
    if (!_user) { toast(t('toast_login_required'), 'error'); return; }
    const p = window._mallDetailProduct;
    if (!p || p.stock <= 0) { toast(t('toast_out_of_stock'), 'error'); return; }

    const optSnap = _getOptionSnapshot();
    const existing = _cart.find(c => c.product_id === productId && JSON.stringify(c.option_snapshot) === JSON.stringify(optSnap));

    if (existing) {
      const newQty = existing.quantity + (window._mallDetailQty || 1);
      await sb.from('mall_cart').update({ quantity: newQty }).eq('id', existing.id);
      existing.quantity = newQty;
    } else {
      const { data } = await sb.from('mall_cart').insert({
        user_id: _user.id, product_id: productId,
        quantity: window._mallDetailQty || 1,
        option_snapshot: optSnap
      }).select().single();
      if (data) _cart.push(data);
    }
    _updateCartBadge();
    toast(t('toast_added_cart'), 'success');
  }

  function _getOptionSnapshot() {
    const snap = {};
    if (window._mallSelectedSize) snap.size = window._mallSelectedSize;
    if (window._mallSelectedColor) snap.color = window._mallSelectedColor;
    if (window._mallDetailPartDelta) snap.part_delta = window._mallDetailPartDelta;
    // PC 부품 상세
    document.querySelectorAll('.pc-part-select').forEach(sel => {
      const opt = sel.selectedOptions[0];
      if (opt) snap[sel.dataset.part] = opt.textContent.replace(/\s*\(.*\)/, '').trim();
    });
    return Object.keys(snap).length ? snap : null;
  }

  function _updateCartBadge() {
    const total = _cart.reduce((s, c) => s + c.quantity, 0);
    const badge = document.getElementById('cart-badge');
    if (!badge) return;
    badge.textContent = total;
    badge.classList.toggle('show', total > 0);
  }

  async function openCart() {
    await _loadCart();
    _renderCart();
    document.getElementById('cart-panel').classList.add('open');
    document.getElementById('cart-overlay').classList.add('show');
  }
  function closeCart() {
    document.getElementById('cart-panel').classList.remove('open');
    document.getElementById('cart-overlay').classList.remove('show');
  }

  async function _renderCart() {
    const list = document.getElementById('cart-list');
    if (!_cart.length) {
      list.innerHTML = '<div class="cart-empty">🛒 장바구니가 비어있습니다</div>';
      document.getElementById('cart-total-price').textContent = '₩0';
      return;
    }
    // 상품 정보 일괄 로드
    const ids = [...new Set(_cart.map(c => c.product_id))];
    const { data: prods } = await sb.from('mall_products').select('id,name,thumbnail_url,sale_price,price,discount_rate').in('id', ids);
    const prodMap = {};
    (prods || []).forEach(p => { prodMap[p.id] = p; });

    let total = 0;
    list.innerHTML = _cart.map(item => {
      const p = prodMap[item.product_id];
      if (!p) return '';
      const price = (p.sale_price ?? p.price) + (item.option_snapshot?.part_delta || 0);
      const subtotal = price * item.quantity;
      total += subtotal;
      const optStr = item.option_snapshot
        ? Object.entries(item.option_snapshot).filter(([k]) => k !== 'part_delta').map(([k,v]) => `${k}: ${v}`).join(' | ')
        : '';
      return `
      <div class="cart-item">
        ${p.thumbnail_url ? `<img class="cart-item-img" src="${p.thumbnail_url}">` : `<div class="cart-item-img" style="display:flex;align-items:center;justify-content:center;font-size:1.5rem;">📦</div>`}
        <div class="cart-item-info">
          <div class="ci-name">${p.name}</div>
          ${optStr ? `<div class="ci-opt">${optStr}</div>` : ''}
          <div class="ci-price">₩${_fmt(price)}</div>
          <div class="ci-qty">
            <button class="ci-qty-btn" onclick="Mall.cartQty(${item.id},-1)">−</button>
            <span>${item.quantity}</span>
            <button class="ci-qty-btn" onclick="Mall.cartQty(${item.id},1)">+</button>
            <button class="ci-del" onclick="Mall.cartRemove(${item.id})">삭제</button>
          </div>
        </div>
      </div>`;
    }).join('');
    document.getElementById('cart-total-price').textContent = `₩${_fmt(total)}`;
  }

  async function cartQty(cartId, dir) {
    const item = _cart.find(c => c.id === cartId);
    if (!item) return;
    const newQty = Math.max(1, item.quantity + dir);
    await sb.from('mall_cart').update({ quantity: newQty }).eq('id', cartId);
    item.quantity = newQty;
    _updateCartBadge();
    _renderCart();
  }
  async function cartRemove(cartId) {
    await sb.from('mall_cart').delete().eq('id', cartId);
    _cart = _cart.filter(c => c.id !== cartId);
    _updateCartBadge();
    _renderCart();
  }

  // ── 주문서 ──────────────────────────────────────────────────
  async function goCheckout() {
    closeCart();
    if (!_cart.length) { toast(t('toast_cart_empty'), 'error'); return; }
    showPage('checkout');
    const page = document.getElementById('page-checkout');

    const ids = [...new Set(_cart.map(c => c.product_id))];
    const { data: prods } = await sb.from('mall_products').select('*').in('id', ids);
    const prodMap = {};
    (prods || []).forEach(p => { prodMap[p.id] = p; });

    let itemsTotal = 0;
    const itemsHtml = _cart.map(item => {
      const p = prodMap[item.product_id];
      if (!p) return '';
      const price = (p.sale_price ?? p.price) + (item.option_snapshot?.part_delta || 0);
      const sub = price * item.quantity;
      itemsTotal += sub;
      return `<div class="co-item-row">
        ${p.thumbnail_url ? `<img style="width:50px;height:50px;object-fit:cover;border-radius:7px;" src="${p.thumbnail_url}">` : ''}
        <div style="flex:1">
          <div style="font-size:.85rem;font-weight:500;">${p.name}</div>
          <div style="font-size:.75rem;color:var(--text-dim);">수량: ${item.quantity}</div>
        </div>
        <div style="font-size:.9rem;font-weight:700;">₩${_fmt(sub)}</div>
      </div>`;
    }).join('');

    const freeMin = parseInt(_settings.free_ship_min || '0');
    const shipFee = (freeMin === 0 || itemsTotal >= freeMin) ? 0 : parseInt(_settings.ship_fee || 3000);
    const finalPrice = itemsTotal + shipFee;

    page.innerHTML = `
    <div class="detail-back" onclick="Mall.openCart()">← 장바구니로</div>
    <h2 style="margin-bottom:20px;font-size:1.2rem;">주문서</h2>
    <div class="checkout-grid">
      <div>
        <div class="co-section">
          <div class="co-title">📦 주문 상품</div>
          ${itemsHtml}
        </div>
        <div class="co-section">
          <div class="co-title">📍 배송지 정보</div>
          <div class="form-group">
            <label class="form-label">받는 분 이름 *</label>
            <input class="form-input" id="co-name" value="${_profile?.real_name||''}">
          </div>
          <div class="form-group">
            <label class="form-label">연락처 *</label>
            <input class="form-input" id="co-phone" value="${_profile?.phone||''}">
          </div>
          <div class="form-group">
            <label class="form-label">주소 *</label>
            <input class="form-input" id="co-addr" value="${_profile?.address||''}" placeholder="주소">
            <input class="form-input" id="co-addr-detail" placeholder="상세 주소" style="margin-top:6px;">
          </div>
          <div class="form-group">
            <label class="form-label">배송 메모</label>
            <select class="form-select" id="co-memo">
              <option value="">선택 없음</option>
              <option>문 앞에 놓아주세요</option>
              <option>경비실에 맡겨주세요</option>
              <option>부재 시 연락주세요</option>
            </select>
          </div>
        </div>
      </div>
      <div>
        <div class="co-summary">
          <div class="co-title">💳 결제 요약</div>
          <div class="co-sum-row"><span>상품 합계</span><span>₩${_fmt(itemsTotal)}</span></div>
          <div class="co-sum-row"><span>배송비</span><span>${shipFee===0?'무료':'₩'+_fmt(shipFee)}</span></div>
          <div class="co-sum-total"><span>최종 결제</span><span>₩${_fmt(finalPrice)}</span></div>
          <button class="btn-buy" style="width:100%;margin-top:16px;" onclick="Mall.startPayment(${finalPrice},${itemsTotal},${shipFee})">결제하기 ₩${_fmt(finalPrice)}</button>
          <div style="font-size:.72rem;color:var(--text-dim);text-align:center;margin-top:8px;">토스페이먼츠 안전 결제</div>
        </div>
      </div>
    </div>`;
  }

  async function buyNow(productId) {
    if (!_user) { toast(t('toast_login_required'), 'error'); return; }
    const p = window._mallDetailProduct;
    if (!p || p.stock <= 0) { toast(t('toast_out_of_stock'), 'error'); return; }
    _cart = [];
    await sb.from('mall_cart').delete().eq('user_id', _user.id);
    await addToCart(productId);
    goCheckout();
  }

  // ── 토스 결제 ───────────────────────────────────────────────
  async function startPayment(finalPrice, itemsTotal, shipFee) {
    const name = document.getElementById('co-name')?.value.trim();
    const phone = document.getElementById('co-phone')?.value.trim();
    const addr = document.getElementById('co-addr')?.value.trim();
    if (!name || !phone || !addr) { toast(t('toast_fill_addr'), 'error'); return; }

    const orderId = `MALL-${Date.now()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
    _tossOrderId = orderId;

    // 주문 임시 저장
    window._mallPendingOrder = {
      finalPrice, itemsTotal, shipFee,
      receiver_name: name, receiver_phone: phone,
      address: addr,
      address_detail: document.getElementById('co-addr-detail')?.value.trim(),
      memo: document.getElementById('co-memo')?.value,
    };

    const widget = TossPayments(MALL_SB_KEY).widgets({ customerKey: _user.id });
    _tossWidget = widget;
    await widget.setAmount({ currency: 'KRW', value: finalPrice });
    document.getElementById('toss-modal').classList.add('show');
    await Promise.all([
      widget.renderPaymentMethods({ selector: '#toss-payment-widget', variantKey: 'DEFAULT' }),
      widget.renderAgreement({ selector: '#toss-agreement-widget', variantKey: 'AGREEMENT' }),
    ]);
    document.getElementById('toss-modal-title').textContent = `결제 금액: ₩${_fmt(finalPrice)}`;
  }

  async function requestPayment() {
    if (!_tossWidget) return;
    const ids = [...new Set(_cart.map(c => c.product_id))];
    const { data: prods } = await sb.from('mall_products').select('id,name').in('id', ids);
    const prodMap = {};
    (prods || []).forEach(p => { prodMap[p.id] = p; });
    const orderName = _cart.length === 1
      ? (prodMap[_cart[0].product_id]?.name || '상품')
      : `${prodMap[_cart[0].product_id]?.name || '상품'} 외 ${_cart.length - 1}건`;

    await _tossWidget.requestPayment({
      orderId: _tossOrderId,
      orderName,
      customerName: _profile?.nickname || '고객',
      customerEmail: _user.email,
      successUrl: `${window.location.origin}/mall.html?payment=success`,
      failUrl: `${window.location.origin}/mall.html?payment=fail`,
    });
  }

  function closeTossModal() {
    document.getElementById('toss-modal').classList.remove('show');
  }

  // ── 결제 성공 처리 ──────────────────────────────────────────
  async function handlePaymentSuccess(paymentKey, orderId, amount) {
    const pending = window._mallPendingOrder;
    if (!pending) return;

    // 재고 검증 및 차감 + 주문 생성
    const ids = [...new Set(_cart.map(c => c.product_id))];
    const { data: prods } = await sb.from('mall_products').select('*').in('id', ids);
    const prodMap = {};
    (prods || []).forEach(p => { prodMap[p.id] = p; });

    // 주문 생성
    const { data: order } = await sb.from('mall_orders').insert({
      user_id: _user.id,
      status: 'paid',
      receiver_name: pending.receiver_name,
      receiver_phone: pending.receiver_phone,
      address: pending.address,
      address_detail: pending.address_detail,
      memo: pending.memo,
      total_price: pending.itemsTotal,
      ship_fee: pending.shipFee,
      final_price: pending.finalPrice,
      toss_payment_key: paymentKey,
      toss_order_id: orderId,
      courier_name: _settings.courier,
      courier_url: _settings.courier_url,
      origin_snapshot: _settings.origin,
    }).select().single();

    if (!order) { toast(t('toast_order_fail'), 'error'); return; }

    // 주문 상품 삽입 + 재고 차감
    for (const item of _cart) {
      const p = prodMap[item.product_id];
      if (!p) continue;
      const price = (p.sale_price ?? p.price) + (item.option_snapshot?.part_delta || 0);
      await sb.from('mall_order_items').insert({
        order_id: order.id,
        product_id: item.product_id,
        product_name: p.name,
        product_thumb: p.thumbnail_url,
        unit_price: price,
        quantity: item.quantity,
        option_snapshot: item.option_snapshot,
      });
      // 재고 차감
      await sb.from('mall_products').update({ stock: Math.max(0, p.stock - item.quantity), sold_count: p.sold_count + item.quantity }).eq('id', p.id);
    }

    // 장바구니 비우기
    await sb.from('mall_cart').delete().eq('user_id', _user.id);
    _cart = [];
    _updateCartBadge();

    toast(`주문 완료! 주문번호: ${order.order_no}`, 'success');
    goMyOrders();
  }

  // ── 주문 내역 ───────────────────────────────────────────────
  async function goMyOrders() {
    showPage('myorder');
    const page = document.getElementById('page-myorder');
    page.innerHTML = '<div class="loading">주문 내역을 불러오는 중...</div>';
    const { data: orders } = await sb.from('mall_orders').select('*, mall_order_items(*)').eq('user_id', _user.id).order('created_at', { ascending: false });

    if (!orders?.length) {
      page.innerHTML = `<div class="detail-back" onclick="Mall.goHome()">← 쇼핑하기</div><div class="empty-state"><div class="emoji">📦</div><p>주문 내역이 없습니다.</p></div>`;
      return;
    }
    const returnPeriod = parseInt(_settings.return_period || '3');
    page.innerHTML = `
    <div class="detail-back" onclick="Mall.goHome()">← 쇼핑 계속하기</div>
    <h2 style="margin-bottom:16px;">📦 주문 내역</h2>
    ${orders.map(o => {
      const statusLabel = _statusLabel(o.status);
      const items = (o.mall_order_items || []);
      const itemNames = items.map(i => i.product_name).join(', ');
      const canReturn = o.status === 'delivered'
        && (Date.now() - new Date(o.updated_at).getTime()) < returnPeriod * 86400000;
      const canInputReturnTracking = o.status === 'return_requested';
      return `
      <div class="order-card">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
          <span class="order-no">${o.order_no}</span>
          <span class="order-status status-${o.status}">${statusLabel}</span>
          <span style="font-size:.72rem;color:var(--text-dim);margin-left:auto;">${_dateStr(o.created_at)}</span>
        </div>
        <div class="order-items" style="color:var(--text-dim);">${itemNames}</div>
        <div class="order-total">₩${_fmt(o.final_price)}</div>
        ${o.tracking_no ? `<div style="margin-top:6px;font-size:.78rem;">운송장: ${o.tracking_no} <a class="track-link" href="${o.courier_url}?invoice=${o.tracking_no}" target="_blank">📍 배송 추적</a></div>` : ''}
        <div class="order-actions">
          ${canReturn ? `<button class="oact-btn danger" onclick="Mall.requestReturn('${o.id}')">반품 요청</button>` : ''}
          ${canInputReturnTracking ? `<button class="oact-btn" onclick="Mall.inputReturnTracking('${o.id}')">반품 운송장 입력</button>` : ''}
          ${o.status === 'return_reviewing' && o.return_fee > 0 && !o.return_fee_paid
            ? `<button class="btn-charge" onclick="Mall.payReturnFee('${o.id}',${o.return_fee})">반품배송비 ₩${_fmt(o.return_fee)} 결제</button>`
            : ''}
          ${o.status === 'delivered' ? `<button class="oact-btn" onclick="Mall.confirmPurchase('${o.id}')">구매 확정</button>` : ''}
        </div>
      </div>`;
    }).join('')}`;
  }

  async function requestReturn(orderId) {
    const reason = prompt('반품 사유를 입력해주세요:');
    if (!reason) return;
    await sb.from('mall_orders').update({ status: 'return_requested', return_reason: reason }).eq('id', orderId);
    toast(t('toast_return_req'), 'success');
    goMyOrders();
  }
  async function inputReturnTracking(orderId) {
    const no = prompt('반품 택배 운송장 번호를 입력해주세요:');
    if (!no) return;
    await sb.from('mall_orders').update({ status: 'return_reviewing', return_tracking_no: no }).eq('id', orderId);
    toast(t('toast_return_review'), 'success');
    goMyOrders();
  }
  async function confirmPurchase(orderId) {
    if (!confirm('구매를 확정하시겠습니까?')) return;
    await sb.from('mall_orders').update({ status: 'confirmed' }).eq('id', orderId);
    toast(t('toast_confirm_done'), 'success');
    goMyOrders();
  }
  async function payReturnFee(orderId, fee) {
    // 반품배송비 토스 결제
    toast(`반품배송비 ₩${_fmt(fee)} 결제 창을 엽니다.`, 'info');
    // TODO: 토스 결제 연동 (startPayment 유사 흐름)
  }

  // ── 문의 ────────────────────────────────────────────────────
  async function _loadInquiries(productId) {
    const { data } = await sb.from('mall_inquiries').select('*').eq('product_id', productId).eq('is_visible', true).order('created_at', { ascending: false });
    const wrap = document.getElementById(`inquiry-list-${productId}`);
    if (!wrap) return;
    wrap.innerHTML = (data||[]).map(q => `
    <div style="border-bottom:1px solid var(--border);padding:12px 0;">
      <div style="font-size:.78rem;color:var(--text-dim);">${q.nickname||'익명'} · ${_dateStr(q.created_at)}</div>
      <div style="font-size:.85rem;margin:5px 0;">${q.is_secret && q.user_id !== _user?.id ? '🔒 비밀글입니다.' : q.content}</div>
      ${q.answer ? `<div style="background:rgba(0,212,255,.06);border-left:2px solid var(--accent);padding:6px 10px;font-size:.8rem;margin-top:6px;border-radius:0 6px 6px 0;">💬 답변: ${q.answer}</div>` : ''}
    </div>`).join('') || '<p style="color:var(--text-dim);text-align:center;padding:20px;">문의가 없습니다.</p>';
  }
  async function openInquiry(productId) {
    const title = prompt('문의 제목:');
    const content = prompt('문의 내용:');
    if (!title || !content) return;
    await sb.from('mall_inquiries').insert({ product_id: productId, user_id: _user?.id, nickname: _profile?.nickname, title, content });
    toast(t('toast_inquiry_done'), 'success');
    _loadInquiries(productId);
  }

  // ── 번역 — mall_i18n.js의 applyLang() 위임 ─────────────────
  function translate(lang) {
    if (typeof applyLang === 'function') applyLang(lang);
  }

  // ── 검색 ────────────────────────────────────────────────────
  function search(q) {
    clearTimeout(_searchTimer);
    _searchQuery = q;
    _searchTimer = setTimeout(() => loadProducts(_currentCat, q), 400);
  }

  // ── 카테고리 선택 ────────────────────────────────────────────
  function selectCat(slug) {
    _currentCat = slug;
    document.querySelectorAll('.cat-tab').forEach(b => b.classList.toggle('active', b.dataset.slug === slug));
    showPage('main');
    loadProducts(slug, _searchQuery);
  }

  // ── 페이지 이동 ──────────────────────────────────────────────
  function goHome() { showPage('main'); loadProducts(_currentCat, _searchQuery); }
  function goAdmin() { showPage('admin'); AdminPanel.init(); }
  function exit() { window.location.href = '../index.html'; }

  // ── 상태 표시 ────────────────────────────────────────────────
  function _statusLabel(s) {
    const map = {
      paid:'status_paid', preparing:'status_preparing', shipping:'status_shipping',
      delivered:'status_delivered', confirmed:'status_confirmed',
      return_requested:'status_return_req', return_reviewing:'status_return_review',
      return_shipping:'status_return_ship', return_completed:'status_return_done',
      cancelled:'status_cancelled'
    };
    return map[s] ? t(map[s]) : s;
  }

  // ── 유틸 ─────────────────────────────────────────────────────
  function _fmt(n) { return Number(n).toLocaleString('ko-KR'); }
  function _dateStr(d) { return d ? new Date(d).toLocaleDateString('ko-KR') : '-'; }
  function _catIcon(slug) { return {computer:'💻',general:'📦',fashion:'👗',book:'📚'}[slug]||'🛍️'; }

  function toast(msg, type = 'info') {
    const wrap = document.getElementById('mall-toast');
    const el = document.createElement('div');
    el.className = `mall-toast-item ${type}`;
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  // ── URL 파라미터 처리 (결제 결과) ────────────────────────────
  function _checkPaymentResult() {
    const params = new URLSearchParams(location.search);
    if (params.get('payment') === 'success') {
      handlePaymentSuccess(params.get('paymentKey'), params.get('orderId'), params.get('amount'));
      history.replaceState({}, '', 'mall.html');
    } else if (params.get('payment') === 'fail') {
      toast(t('toast_pay_cancel'), 'error');
      history.replaceState({}, '', 'mall.html');
    }
  }

  // ── 공개 API ─────────────────────────────────────────────────
  return {
    init, loadProducts, openDetail, goHome, goAdmin, exit,
    openCart, closeCart, addToCart, cartQty, cartRemove, goCheckout,
    buyNow, startPayment, requestPayment, closeTossModal, goMyOrders,
    requestReturn, inputReturnTracking, confirmPurchase, payReturnFee,
    openInquiry, translate, search, selectCat, switchDetailTab,
    slideMove, slideTo, selectSize, selectColor, updatePartPrice, changeQty,
    toast,
    // admin용
    getUser: () => _user,
    getProfile: () => _profile,
    getSettings: () => _settings,
    updateSettings: async (key, value) => {
      await sb.from('mall_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key);
      _settings[key] = value;
    },
    sb,
  };
})();

// mall.js Part 2 는 AdminPanel 로드
