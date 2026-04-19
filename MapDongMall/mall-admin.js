// ════════════════════════════════════════════════════════════════
// MapDong Mall — mall-admin.js  v1.0
// 관리자 패널 (mall.js 이후 로드)
// ════════════════════════════════════════════════════════════════

const AdminPanel = (() => {
  const sb = Mall.sb;
  let _currentAdminPage = 'dashboard';

  // ── 초기화 ──────────────────────────────────────────────────
  async function init() {
    const page = document.getElementById('page-admin');
    page.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
      <div>
        <h1 style="font-size:1.3rem;font-weight:700;">⚙️ 관리자 패널</h1>
        <p style="font-size:.78rem;color:var(--text-dim);">MapDong Mall 전체 관리</p>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;" id="admin-translate-group">
        <button class="tbtn active" onclick="Mall.translate('ko')">KO</button>
        <button class="tbtn" onclick="Mall.translate('en')">EN</button>
        <button class="tbtn" onclick="Mall.translate('ja')">JA</button>
        <button class="tbtn" onclick="Mall.translate('th')">TH</button>
      </div>
    </div>
    <div class="admin-grid">
      <nav class="admin-nav">
        <div class="anav-section">📊 현황</div>
        <div class="anav-item active" data-page="dashboard" onclick="AdminPanel.nav('dashboard',this)">🏠 대시보드 <span style="font-size:.7rem;color:var(--text-dim);">매출·현황 한눈에</span></div>
        <div class="anav-section">🛍️ 상품 관리</div>
        <div class="anav-item" data-page="products" onclick="AdminPanel.nav('products',this)">📦 상품 목록</div>
        <div class="anav-item" data-page="product-add" onclick="AdminPanel.nav('product-add',this)">➕ 상품 등록 <span style="font-size:.7rem;color:var(--text-dim);">새 상품 추가</span></div>
        <div class="anav-section">📋 주문 관리</div>
        <div class="anav-item" data-page="orders" onclick="AdminPanel.nav('orders',this)">📋 전체 주문 <span class="anav-badge" id="badge-new-orders" style="display:none;">0</span></div>
        <div class="anav-item" data-page="returns" onclick="AdminPanel.nav('returns',this)">🔄 반품 관리 <span class="anav-badge" id="badge-returns" style="display:none;">0</span></div>
        <div class="anav-section">💬 고객 서비스</div>
        <div class="anav-item" data-page="inquiries" onclick="AdminPanel.nav('inquiries',this)">❓ 1:1 문의 <span class="anav-badge" id="badge-inquiries" style="display:none;">0</span></div>
        <div class="anav-item" data-page="reviews" onclick="AdminPanel.nav('reviews',this)">⭐ 후기 관리</div>
        <div class="anav-item" data-page="blacklist" onclick="AdminPanel.nav('blacklist',this)">🚫 블랙리스트</div>
        <div class="anav-section">⚙️ 설정</div>
        <div class="anav-item" data-page="settings-ship" onclick="AdminPanel.nav('settings-ship',this)">🚚 배송·원산지 <span style="font-size:.7rem;color:var(--text-dim);">전체 상품 적용</span></div>
        <div class="anav-item" data-page="settings-shop" onclick="AdminPanel.nav('settings-shop',this)">🏪 쇼핑몰 설정</div>
      </nav>
      <div class="admin-content" id="admin-content">
        <div class="loading">로딩 중...</div>
      </div>
    </div>`;

    await _loadBadges();
    nav('dashboard', document.querySelector('.anav-item'));
  }

  async function _loadBadges() {
    const [{ count: newOrders }, { count: returns }, { count: inquiries }] = await Promise.all([
      sb.from('mall_orders').select('*', { count: 'exact', head: true }).eq('status', 'paid'),
      sb.from('mall_orders').select('*', { count: 'exact', head: true }).in('status', ['return_requested', 'return_reviewing']),
      sb.from('mall_inquiries').select('*', { count: 'exact', head: true }).is('answer', null),
    ]);
    _setBadge('badge-new-orders', newOrders);
    _setBadge('badge-returns', returns);
    _setBadge('badge-inquiries', inquiries);
  }
  function _setBadge(id, n) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = n; el.style.display = n > 0 ? '' : 'none';
  }

  function nav(page, el) {
    _currentAdminPage = page;
    document.querySelectorAll('.anav-item').forEach(a => a.classList.remove('active'));
    if (el) el.classList.add('active');
    _renderPage(page);
  }

  async function _renderPage(page) {
    const content = document.getElementById('admin-content');
    content.innerHTML = '<div class="loading">불러오는 중...</div>';
    switch(page) {
      case 'dashboard':     return await _pageDashboard(content);
      case 'products':      return await _pageProducts(content);
      case 'product-add':   return _pageProductAdd(content);
      case 'orders':        return await _pageOrders(content);
      case 'returns':       return await _pageReturns(content);
      case 'inquiries':     return await _pageInquiries(content);
      case 'reviews':       return await _pageReviews(content);
      case 'blacklist':     return await _pageBlacklist(content);
      case 'settings-ship': return _pageSettingsShip(content);
      case 'settings-shop': return _pageSettingsShop(content);
      default: content.innerHTML = '<div class="empty-state"><p>페이지를 찾을 수 없습니다.</p></div>';
    }
  }

  // ── 대시보드 ─────────────────────────────────────────────────
  async function _pageDashboard(el) {
    const [{ data: daily }, { count: totalOrders }, { count: pendingOrders }, { data: topProds }] = await Promise.all([
      sb.from('mall_sales_daily').select('*').limit(7),
      sb.from('mall_orders').select('*', { count: 'exact', head: true }).not('status', 'eq', 'cancelled'),
      sb.from('mall_orders').select('*', { count: 'exact', head: true }).eq('status', 'paid'),
      sb.from('mall_products').select('name,sold_count,stock').order('sold_count', { ascending: false }).limit(5),
    ]);
    const todayRow = daily?.[0];
    const todayRev = todayRow?.revenue || 0;
    const todayOrders = todayRow?.order_count || 0;
    const monthRev = (daily || []).reduce((s, r) => s + Number(r.revenue || 0), 0);

    el.innerHTML = `
    <div class="ap-title">📊 대시보드</div>
    <div class="ap-desc">오늘의 매출 현황과 주요 통계입니다.</div>
    <div class="dash-grid">
      <div class="dash-card">
        <div class="dash-num">₩${_fmt(todayRev)}</div>
        <div class="dash-label">오늘 매출</div>
        <div class="dash-sub">주문 ${todayOrders}건</div>
      </div>
      <div class="dash-card">
        <div class="dash-num">₩${_fmt(monthRev)}</div>
        <div class="dash-label">최근 7일 매출</div>
      </div>
      <div class="dash-card">
        <div class="dash-num">${totalOrders}</div>
        <div class="dash-label">전체 주문</div>
      </div>
      <div class="dash-card" style="border-color:var(--accent2);">
        <div class="dash-num" style="color:var(--accent2);">${pendingOrders}</div>
        <div class="dash-label">처리 대기</div>
        <div class="dash-sub">결제완료 상태</div>
      </div>
    </div>
    <h3 style="font-size:.95rem;font-weight:700;margin-bottom:10px;">🏆 판매 Top 5</h3>
    <table class="admin-table">
      <thead><tr><th>상품명</th><th>판매수</th><th>재고</th></tr></thead>
      <tbody>${(topProds||[]).map(p=>`
      <tr>
        <td>${p.name}</td>
        <td>${p.sold_count}</td>
        <td class="${p.stock<=5?'stock-warn':'stock-ok'}">${p.stock}${p.stock<=5?' ⚠️':''}</td>
      </tr>`).join('')}</tbody>
    </table>`;
  }

  // ── 상품 목록 ────────────────────────────────────────────────
  async function _pageProducts(el) {
    const { data } = await sb.from('mall_products').select('*').order('created_at', { ascending: false });
    el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
      <div><div class="ap-title">📦 상품 목록</div><div class="ap-desc">등록된 모든 상품을 관리합니다.</div></div>
      <button class="btn-add" onclick="AdminPanel.nav('product-add',null)">➕ 상품 등록</button>
    </div>
    <div style="overflow-x:auto;">
    <table class="admin-table">
      <thead><tr><th>이미지</th><th>상품명</th><th>카테고리</th><th>판매가</th><th>할인</th><th>재고</th><th>상태</th><th>관리</th></tr></thead>
      <tbody>${(data||[]).map(p=>`
      <tr>
        <td>${p.thumbnail_url?`<img src="${p.thumbnail_url}" style="width:44px;height:44px;object-fit:cover;border-radius:6px;">`:'—'}</td>
        <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.name}</td>
        <td>${p.category_slug}</td>
        <td>₩${_fmt(p.sale_price??p.price)}</td>
        <td>${p.discount_rate>0?`<span style="color:var(--accent2);">${p.discount_rate}%</span>`:'—'}</td>
        <td class="${p.stock<=5?'stock-warn':'stock-ok'}">${p.stock}${p.stock===0?' 품절':''}</td>
        <td><span class="${p.is_active?'stock-ok':'stock-warn'}">${p.is_active?'노출중':'숨김'}</span></td>
        <td style="white-space:nowrap;">
          <button class="oact-btn" onclick="AdminPanel.editProduct('${p.id}')" style="font-size:.72rem;padding:4px 8px;">수정</button>
          <button class="oact-btn danger" onclick="AdminPanel.deleteProduct('${p.id}')" style="font-size:.72rem;padding:4px 8px;">삭제</button>
        </td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  // ── 상품 등록 ────────────────────────────────────────────────
  function _pageProductAdd(el, editData) {
    const isEdit = !!editData;
    const p = editData || {};
    el.innerHTML = `
    <div class="ap-title">${isEdit?'✏️ 상품 수정':'➕ 상품 등록'}</div>
    <div class="ap-desc">모든 카테고리 공통: 썸네일 1장 + 추가사진 최대 6장. 이미지는 자동으로 가로 780px로 리사이징됩니다.</div>
    <form id="prod-form" onsubmit="AdminPanel.submitProduct(event,'${p.id||''}')">

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">카테고리 *</label>
          <div class="form-hint">💻 컴퓨터 선택 시 부품 옵션이 추가됩니다.</div>
          <select class="form-select" id="pf-cat" onchange="AdminPanel.onCatChange()" required>
            <option value="">선택</option>
            <option value="computer" ${p.category_slug==='computer'?'selected':''}>💻 컴퓨터</option>
            <option value="general" ${p.category_slug==='general'?'selected':''}>📦 일반제품</option>
            <option value="fashion" ${p.category_slug==='fashion'?'selected':''}>👗 패션</option>
            <option value="book" ${p.category_slug==='book'?'selected':''}>📚 도서</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">노출 상태</label>
          <select class="form-select" id="pf-active">
            <option value="1" ${p.is_active!==false?'selected':''}>노출 중</option>
            <option value="0" ${p.is_active===false?'selected':''}>숨김</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">상품명 *</label>
        <input class="form-input" id="pf-name" value="${p.name||''}" required placeholder="예: 게이밍 PC 고사양 RTX 4070">
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">원가 (원) *</label>
          <div class="form-hint">할인 전 정가입니다.</div>
          <input class="form-input" id="pf-price" type="number" min="0" value="${p.price||''}" required placeholder="예: 1200000">
        </div>
        <div class="form-group">
          <label class="form-label">할인율 (%)</label>
          <div class="form-hint">0~100. 20% 입력 시 정가에서 20% 할인된 가격이 자동 계산됩니다.</div>
          <input class="form-input" id="pf-discount" type="number" min="0" max="100" value="${p.discount_rate||0}" onchange="AdminPanel.calcSalePrice()">
        </div>
      </div>
      <div style="background:rgba(0,212,255,.06);border-radius:8px;padding:10px 14px;font-size:.82rem;margin-bottom:16px;">
        판매가: <strong id="pf-sale-preview">₩${_fmt(p.sale_price||p.price||0)}</strong>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">재고 수량 *</label>
          <div class="form-hint">0이면 자동으로 품절 표시됩니다.</div>
          <input class="form-input" id="pf-stock" type="number" min="0" value="${p.stock||0}" required>
        </div>
        <div class="form-group">
          <label class="form-label">재고 경고 기준</label>
          <div class="form-hint">이 수량 이하가 되면 관리자 화면에서 경고 표시됩니다.</div>
          <input class="form-input" id="pf-alert" type="number" min="0" value="${p.stock_alert||5}">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">무료배송</label>
          <div class="form-hint">체크 해제 시 전역 배송비가 적용됩니다.</div>
          <label style="display:flex;align-items:center;gap:8px;margin-top:6px;cursor:pointer;">
            <input type="checkbox" id="pf-freeship" ${p.is_free_ship!==false?'checked':''} style="width:18px;height:18px;">
            <span style="font-size:.85rem;">이 상품은 무료배송</span>
          </label>
        </div>
        <div class="form-group">
          <label class="form-label">화물 여부</label>
          <div class="form-hint">화물이면 반품배송비가 더 높게 적용됩니다.</div>
          <label style="display:flex;align-items:center;gap:8px;margin-top:6px;cursor:pointer;">
            <input type="checkbox" id="pf-cargo" ${p.is_cargo?'checked':''} style="width:18px;height:18px;">
            <span style="font-size:.85rem;">화물 상품</span>
          </label>
        </div>
      </div>

      <!-- 썸네일 -->
      <div class="form-group">
        <label class="form-label">대표 이미지 (썸네일) *</label>
        <div class="form-hint">상품 목록에서 보이는 메인 이미지입니다. 자동으로 가로 780px에 맞게 리사이징됩니다.</div>
        <div class="img-upload-zone" onclick="document.getElementById('pf-thumb-file').click()">
          📷 클릭하여 이미지 선택
        </div>
        <input type="file" id="pf-thumb-file" accept="image/*" style="display:none" onchange="AdminPanel.previewThumb(this)">
        <div id="pf-thumb-preview" style="margin-top:8px;"></div>
        <input type="hidden" id="pf-thumb-url" value="${p.thumbnail_url||''}">
      </div>

      <!-- 추가 이미지 -->
      <div class="form-group">
        <label class="form-label">추가 이미지 (최대 6장)</label>
        <div class="form-hint">상세 페이지 슬라이드쇼로 표시됩니다. 드래그로 순서 변경 가능합니다.</div>
        <div class="img-upload-zone" onclick="document.getElementById('pf-imgs-file').click()">
          🖼️ 클릭하여 추가 이미지 선택 (여러 장 가능)
        </div>
        <input type="file" id="pf-imgs-file" accept="image/*" multiple style="display:none" onchange="AdminPanel.previewExtraImgs(this)">
        <div class="thumb-preview-wrap" id="pf-imgs-preview"></div>
      </div>

      <!-- 상세 설명 에디터 -->
      <div class="form-group">
        <label class="form-label">상세 설명</label>
        <div class="form-hint">글꼴 크기·색상·이미지 삽입 가능. HTML로 저장됩니다.</div>
        <div id="pf-editor-toolbar" style="display:flex;gap:6px;flex-wrap:wrap;padding:8px;background:var(--surface2);border:1px solid var(--border);border-bottom:none;border-radius:8px 8px 0 0;">
          <button type="button" class="oact-btn" onclick="AdminPanel.edCmd('bold')" title="굵게"><b>B</b></button>
          <button type="button" class="oact-btn" onclick="AdminPanel.edCmd('italic')" title="기울임"><i>I</i></button>
          <button type="button" class="oact-btn" onclick="AdminPanel.edCmd('underline')" title="밑줄"><u>U</u></button>
          <select class="form-select" style="width:auto;padding:4px 8px;" onchange="AdminPanel.edCmd('fontSize',this.value)">
            <option value="3">보통</option><option value="1">작게</option><option value="5">크게</option><option value="7">매우 크게</option>
          </select>
          <input type="color" id="ed-color" style="width:30px;height:28px;border:none;background:none;cursor:pointer;" onchange="AdminPanel.edCmd('foreColor',this.value)" title="글자색">
          <button type="button" class="oact-btn" onclick="AdminPanel.edInsertImg()" title="이미지 삽입">🖼️</button>
          <button type="button" class="oact-btn" onclick="AdminPanel.edCmd('justifyLeft')">◀</button>
          <button type="button" class="oact-btn" onclick="AdminPanel.edCmd('justifyCenter')">≡</button>
          <button type="button" class="oact-btn" onclick="AdminPanel.edCmd('justifyRight')">▶</button>
        </div>
        <div id="pf-editor" contenteditable="true"
          style="min-height:200px;background:var(--surface2);border:1px solid var(--border);border-radius:0 0 8px 8px;padding:12px;font-size:.88rem;line-height:1.7;outline:none;"
          >${p.description||''}</div>
      </div>

      <!-- 카테고리별 추가 섹션 -->
      <div id="cat-extra"></div>

      <div style="display:flex;gap:10px;margin-top:8px;">
        <button type="submit" class="btn-save">💾 ${isEdit?'수정 완료':'상품 등록'}</button>
        <button type="button" class="btn-danger" onclick="AdminPanel.nav('products',null)">취소</button>
      </div>
    </form>`;

    if (p.category_slug) onCatChange(p.category_slug, p);
    calcSalePrice();
  }

  function edCmd(cmd, val) {
    document.execCommand(cmd, false, val || null);
    document.getElementById('pf-editor').focus();
  }
  function edInsertImg() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = async e => {
      const url = await _resizeAndUpload(e.target.files[0]);
      if (url) document.execCommand('insertImage', false, url);
    };
    input.click();
  }

  function onCatChange(forceSlug, editData) {
    const slug = forceSlug || document.getElementById('pf-cat')?.value;
    const wrap = document.getElementById('cat-extra');
    if (!wrap) return;

    if (slug === 'computer') {
      wrap.innerHTML = `
      <div class="form-group">
        <label class="form-label" style="font-size:.95rem;font-weight:700;">🖥️ PC 부품 옵션</label>
        <div class="form-hint">각 부품 종류별로 선택 가능한 옵션을 추가하세요. 고객이 선택하면 가격이 자동으로 계산됩니다.</div>
        <div id="pc-parts-editor"></div>
        <button type="button" class="btn-add" style="margin-top:8px;" onclick="AdminPanel.addPartRow()">+ 부품 추가</button>
      </div>`;
      (editData?.parts || []).forEach(pt => addPartRow(pt));
    } else if (slug === 'fashion') {
      wrap.innerHTML = `
      <div class="form-group">
        <label class="form-label" style="font-size:.95rem;font-weight:700;">👗 사이즈·색상 옵션</label>
        <div class="form-hint">사이즈와 색상 조합별로 재고를 관리합니다. 추가금액이 0이면 기본가와 동일합니다.</div>
        <div id="fashion-opts-editor"></div>
        <button type="button" class="btn-add" style="margin-top:8px;" onclick="AdminPanel.addFashionOpt()">+ 옵션 추가</button>
      </div>`;
      (editData?.fashOpts || []).forEach(o => addFashionOpt(o));
    } else if (slug === 'book') {
      wrap.innerHTML = `
      <div class="form-row">
        <div class="form-group"><label class="form-label">ISBN</label><input class="form-input" id="pf-isbn" value="${editData?.book_isbn||''}"></div>
        <div class="form-group"><label class="form-label">저자</label><input class="form-input" id="pf-author" value="${editData?.book_author||''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">출판사</label><input class="form-input" id="pf-publisher" value="${editData?.book_publisher||''}"></div>
        <div class="form-group"><label class="form-label">출판일</label><input class="form-input" id="pf-pubdate" type="date" value="${editData?.book_pub_date||''}"></div>
      </div>`;
    } else {
      wrap.innerHTML = '';
    }
  }

  function addPartRow(data) {
    const wrap = document.getElementById('pc-parts-editor');
    const row = document.createElement('div');
    row.className = 'form-row';
    row.style = 'align-items:center;gap:8px;margin-bottom:8px;';
    row.innerHTML = `
    <select class="form-select" name="part-type" style="flex:0 0 110px;">
      ${['CPU','RAM','VGA','M/B','SSD','HDD','CASE','PSU','COOLER','OS'].map(t=>`<option value="${t}" ${data?.part_type===t?'selected':''}>${t}</option>`).join('')}
    </select>
    <input class="form-input" name="part-name" placeholder="부품명 (예: Intel i9-14900K)" value="${data?.name||''}" style="flex:2;">
    <input class="form-input" name="part-delta" type="number" placeholder="추가금액 (0=기본)" value="${data?.price_delta||0}" style="flex:0 0 130px;">
    <label style="display:flex;align-items:center;gap:4px;font-size:.78rem;white-space:nowrap;"><input type="checkbox" name="part-default" ${data?.is_default?'checked':''}> 기본선택</label>
    <button type="button" class="btn-danger" style="padding:6px 10px;" onclick="this.parentElement.remove()">✕</button>`;
    wrap.appendChild(row);
  }

  function addFashionOpt(data) {
    const wrap = document.getElementById('fashion-opts-editor');
    const row = document.createElement('div');
    row.className = 'form-row';
    row.style = 'align-items:center;gap:8px;margin-bottom:8px;';
    row.innerHTML = `
    <input class="form-input" name="fopt-size" placeholder="사이즈 (S/M/L)" value="${data?.size||''}" style="flex:1;">
    <input class="form-input" name="fopt-color" placeholder="색상명 (블랙)" value="${data?.color||''}" style="flex:1;">
    <input type="color" name="fopt-hex" value="${data?.color_hex||'#000000'}" style="width:36px;height:36px;border:none;border-radius:6px;cursor:pointer;">
    <input class="form-input" name="fopt-stock" type="number" placeholder="재고" value="${data?.stock||0}" style="flex:0 0 80px;">
    <input class="form-input" name="fopt-delta" type="number" placeholder="추가금액" value="${data?.price_delta||0}" style="flex:0 0 100px;">
    <button type="button" class="btn-danger" style="padding:6px 10px;" onclick="this.parentElement.remove()">✕</button>`;
    wrap.appendChild(row);
  }

  function calcSalePrice() {
    const price = parseInt(document.getElementById('pf-price')?.value||0);
    const disc = parseInt(document.getElementById('pf-discount')?.value||0);
    const sale = price - Math.floor(price * disc / 100);
    const preview = document.getElementById('pf-sale-preview');
    if (preview) preview.textContent = `₩${_fmt(sale)}`;
  }

  async function previewThumb(input) {
    const file = input.files[0];
    if (!file) return;
    const url = await _resizeToCanvas(file, 780);
    document.getElementById('pf-thumb-preview').innerHTML = `<img src="${url}" style="width:100px;height:100px;object-fit:cover;border-radius:8px;">`;
    document.getElementById('pf-thumb-url').value = url;
  }

  async function previewExtraImgs(input) {
    const files = Array.from(input.files).slice(0, 6);
    const wrap = document.getElementById('pf-imgs-preview');
    for (const file of files) {
      const url = await _resizeToCanvas(file, 780);
      const div = document.createElement('div');
      div.className = 'thumb-preview';
      div.innerHTML = `<img src="${url}"><button class="thumb-del" type="button" onclick="this.parentElement.remove()">✕</button>`;
      div.dataset.url = url;
      wrap.appendChild(div);
    }
  }

  // 이미지 리사이징: 가로 780px 고정, 세로 비율 유지
  function _resizeToCanvas(file, maxW = 780) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const ratio = img.height / img.width;
          const w = Math.min(img.width, maxW);
          const h = Math.round(w * ratio);
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.88));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // Supabase Storage 업로드
  async function _uploadToStorage(dataUrl, path) {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const { data, error } = await sb.storage.from(Mall.STORAGE_BUCKET || 'mall-images').upload(path, blob, { upsert: true });
    if (error) { console.error(error); return null; }
    const { data: urlData } = sb.storage.from('mall-images').getPublicUrl(path);
    return urlData?.publicUrl || null;
  }

  async function _resizeAndUpload(file) {
    const dataUrl = await _resizeToCanvas(file, 780);
    const path = `desc/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
    return await _uploadToStorage(dataUrl, path);
  }

  async function submitProduct(e, editId) {
    e.preventDefault();
    const cat = document.getElementById('pf-cat').value;
    const name = document.getElementById('pf-name').value.trim();
    const price = parseInt(document.getElementById('pf-price').value);
    const discount_rate = parseInt(document.getElementById('pf-discount').value||0);
    const stock = parseInt(document.getElementById('pf-stock').value||0);
    const stock_alert = parseInt(document.getElementById('pf-alert').value||5);
    const is_free_ship = document.getElementById('pf-freeship').checked;
    const is_cargo = document.getElementById('pf-cargo').checked;
    const is_active = document.getElementById('pf-active').value === '1';
    const description = document.getElementById('pf-editor').innerHTML;

    if (!cat || !name) { Mall.toast('카테고리와 상품명을 입력해주세요.', 'error'); return; }

    // 썸네일 업로드
    let thumbnail_url = document.getElementById('pf-thumb-url').value;
    if (thumbnail_url && thumbnail_url.startsWith('data:')) {
      thumbnail_url = await _uploadToStorage(thumbnail_url, `thumb/${Date.now()}.jpg`);
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

    let productId = editId;
    if (editId) {
      await sb.from('mall_products').update(productData).eq('id', editId);
    } else {
      const { data } = await sb.from('mall_products').insert(productData).select().single();
      productId = data?.id;
    }

    // 추가 이미지 업로드
    if (productId) {
      const imgPreviews = document.querySelectorAll('#pf-imgs-preview .thumb-preview');
      await sb.from('mall_product_images').delete().eq('product_id', productId);
      for (let i = 0; i < imgPreviews.length; i++) {
        let url = imgPreviews[i].dataset.url;
        if (url && url.startsWith('data:')) {
          url = await _uploadToStorage(url, `product/${productId}_${i}.jpg`);
        }
        if (url) await sb.from('mall_product_images').insert({ product_id: productId, url, sort_order: i });
      }

      // PC 부품
      if (cat === 'computer') {
        await sb.from('mall_pc_parts').delete().eq('product_id', productId);
        document.querySelectorAll('#pc-parts-editor .form-row').forEach(async row => {
          const partType = row.querySelector('[name=part-type]')?.value;
          const partName = row.querySelector('[name=part-name]')?.value;
          const delta = parseInt(row.querySelector('[name=part-delta]')?.value||0);
          const isDef = row.querySelector('[name=part-default]')?.checked;
          if (partType && partName) {
            await sb.from('mall_pc_parts').insert({ product_id: productId, part_type: partType, name: partName, price_delta: delta, is_default: isDef });
          }
        });
      }
      // 패션 옵션
      if (cat === 'fashion') {
        await sb.from('mall_fashion_options').delete().eq('product_id', productId);
        document.querySelectorAll('#fashion-opts-editor .form-row').forEach(async row => {
          const size = row.querySelector('[name=fopt-size]')?.value;
          const color = row.querySelector('[name=fopt-color]')?.value;
          const hex = row.querySelector('[name=fopt-hex]')?.value;
          const stock = parseInt(row.querySelector('[name=fopt-stock]')?.value||0);
          const delta = parseInt(row.querySelector('[name=fopt-delta]')?.value||0);
          if (size || color) await sb.from('mall_fashion_options').insert({ product_id: productId, size, color, color_hex: hex, stock, price_delta: delta });
        });
      }
    }

    Mall.toast(editId ? '상품이 수정됐습니다.' : '상품이 등록됐습니다.', 'success');
    nav('products', null);
  }

  async function editProduct(id) {
    const [{ data: p }, { data: imgs }, { data: parts }, { data: fashOpts }] = await Promise.all([
      sb.from('mall_products').select('*').eq('id', id).single(),
      sb.from('mall_product_images').select('*').eq('product_id', id).order('sort_order'),
      sb.from('mall_pc_parts').select('*').eq('product_id', id),
      sb.from('mall_fashion_options').select('*').eq('product_id', id),
    ]);
    const content = document.getElementById('admin-content');
    _pageProductAdd(content, { ...p, parts, fashOpts });
  }

  async function deleteProduct(id) {
    if (!confirm('정말 삭제하시겠습니까? 관련 이미지·옵션도 모두 삭제됩니다.')) return;
    await sb.from('mall_products').delete().eq('id', id);
    Mall.toast('삭제됐습니다.', 'success');
    nav('products', null);
  }

  // ── 주문 관리 ────────────────────────────────────────────────
  async function _pageOrders(el, offset = 0, limit = 20) {
    const statuses = ['paid','preparing','shipping','delivered','confirmed'];
    const { data: orders, count } = await sb.from('mall_orders')
      .select('*, mall_order_items(*)', { count: 'exact' })
      .in('status', statuses)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    el.innerHTML = `
    <div class="ap-title">📋 전체 주문</div>
    <div class="ap-desc">주문 상태 변경, 운송장 입력, 고객 검색이 가능합니다.</div>
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
      <input class="form-input" id="order-search" placeholder="주문번호 or 받는분 이름 검색..." style="max-width:280px;" onkeydown="if(event.key==='Enter')AdminPanel.searchOrders()">
      <button class="btn-save" onclick="AdminPanel.searchOrders()" style="padding:8px 16px;">검색</button>
      <select class="form-select" id="order-limit" style="width:auto;" onchange="AdminPanel.nav('orders',null)">
        <option value="10">10개씩</option>
        <option value="20" selected>20개씩</option>
        <option value="30">30개씩</option>
        <option value="50">50개씩</option>
        <option value="100">100개씩</option>
      </select>
    </div>
    <div style="overflow-x:auto;">
    <table class="admin-table">
      <thead><tr><th>주문번호</th><th>상품</th><th>받는분</th><th>금액</th><th>상태</th><th>운송장</th><th>날짜</th><th>관리</th></tr></thead>
      <tbody>${(orders||[]).map(o => {
        const items = (o.mall_order_items||[]);
        return `<tr>
          <td style="font-size:.75rem;">${o.order_no}</td>
          <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${items.map(i=>i.product_name).join(', ')}</td>
          <td>${o.receiver_name}<br><span style="font-size:.72rem;color:var(--text-dim);">${o.receiver_phone}</span></td>
          <td>₩${_fmt(o.final_price)}</td>
          <td>
            <select class="status-select" onchange="AdminPanel.updateOrderStatus('${o.id}',this.value)">
              ${['paid','preparing','shipping','delivered','confirmed'].map(s=>`<option value="${s}" ${o.status===s?'selected':''}>${_statusLabel(s)}</option>`).join('')}
            </select>
          </td>
          <td>
            ${o.tracking_no||'—'}
            <button class="oact-btn" style="font-size:.7rem;padding:3px 7px;display:block;margin-top:3px;" onclick="AdminPanel.inputTracking('${o.id}')">운송장 입력</button>
          </td>
          <td style="font-size:.75rem;">${_dateStr(o.created_at)}</td>
          <td>
            <button class="oact-btn" style="font-size:.72rem;padding:4px 8px;" onclick="AdminPanel.viewOrder('${o.id}')">상세</button>
          </td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>
    <div style="margin-top:12px;font-size:.78rem;color:var(--text-dim);">총 ${count}건</div>`;
  }

  async function searchOrders() {
    const q = document.getElementById('order-search')?.value.trim();
    if (!q) return nav('orders', null);
    const { data } = await sb.from('mall_orders').select('*, mall_order_items(*)')
      .or(`order_no.ilike.%${q}%,receiver_name.ilike.%${q}%,address.ilike.%${q}%`);
    const el = document.getElementById('admin-content');
    el.querySelector('tbody').innerHTML = (data||[]).map(o => `<tr><td>${o.order_no}</td><td>${o.receiver_name}</td><td>₩${_fmt(o.final_price)}</td><td>${_statusLabel(o.status)}</td></tr>`).join('');
  }

  async function updateOrderStatus(orderId, status) {
    await sb.from('mall_orders').update({ status }).eq('id', orderId);
    Mall.toast('상태가 변경됐습니다.', 'success');
    _loadBadges();
  }

  async function inputTracking(orderId) {
    const no = prompt('운송장 번호를 입력하세요:');
    if (!no) return;
    await sb.from('mall_orders').update({ tracking_no: no, status: 'shipping' }).eq('id', orderId);
    Mall.toast('운송장이 등록됐습니다.', 'success');
    nav('orders', null);
  }

  // ── 반품 관리 ────────────────────────────────────────────────
  async function _pageReturns(el) {
    const { data: orders } = await sb.from('mall_orders')
      .select('*')
      .in('status', ['return_requested','return_reviewing','return_shipping','return_completed'])
      .order('created_at', { ascending: false });

    el.innerHTML = `
    <div class="ap-title">🔄 반품 관리</div>
    <div class="ap-desc">반품 요청 내역과 반품배송비 청구, 반품 완료 처리를 합니다.</div>
    <div style="overflow-x:auto;">
    <table class="admin-table">
      <thead><tr><th>주문번호</th><th>고객</th><th>반품사유</th><th>고객 운송장</th><th>상태</th><th>반품배송비</th><th>관리</th></tr></thead>
      <tbody>${(orders||[]).map(o=>`
      <tr>
        <td style="font-size:.75rem;">${o.order_no}</td>
        <td>${o.receiver_name}</td>
        <td style="max-width:160px;font-size:.8rem;">${o.return_reason||'—'}</td>
        <td style="font-size:.8rem;">${o.return_tracking_no||'미입력'}</td>
        <td><span class="order-status status-${o.status}">${_statusLabel(o.status)}</span></td>
        <td>
          ${o.return_fee > 0 ? `₩${_fmt(o.return_fee)} ${o.return_fee_paid?'<span style="color:var(--accent3);">결제완료</span>':'<span style="color:var(--accent2);">미결제</span>'}` : '미설정'}
          ${!o.return_fee || !o.return_fee_paid ? `
          <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap;">
            <input id="rf-${o.id}" type="number" placeholder="청구금액" style="width:90px;background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:5px;padding:3px 6px;font-size:.75rem;" value="${o.return_fee||Mall.getSettings().return_fee||5000}">
            <button class="btn-charge" onclick="AdminPanel.chargeReturnFee('${o.id}')" style="font-size:.72rem;padding:4px 8px;">청구</button>
            <button class="oact-btn" onclick="AdminPanel.freeReturn('${o.id}')" style="font-size:.72rem;padding:4px 8px;">무료처리</button>
          </div>` : ''}
        </td>
        <td>
          ${(o.return_fee_paid || o.return_fee === 0) && o.status !== 'return_completed'
            ? `<button class="btn-save" style="font-size:.75rem;padding:5px 10px;" onclick="AdminPanel.completeReturn('${o.id}')">반품 완료</button>`
            : ''}
        </td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  async function chargeReturnFee(orderId) {
    const fee = parseInt(document.getElementById(`rf-${orderId}`)?.value||0);
    await sb.from('mall_orders').update({ return_fee: fee }).eq('id', orderId);
    Mall.toast(`₩${_fmt(fee)} 반품배송비가 고객에게 청구됐습니다. 고객이 결제 후 반품 완료 처리됩니다.`, 'success');
    nav('returns', null);
  }
  async function freeReturn(orderId) {
    await sb.from('mall_orders').update({ return_fee: 0, return_fee_paid: true }).eq('id', orderId);
    Mall.toast('무료 반품으로 처리됐습니다.', 'success');
    nav('returns', null);
  }
  async function completeReturn(orderId) {
    // 재고 복구
    const { data: order } = await sb.from('mall_orders').select('*, mall_order_items(*)').eq('id', orderId).single();
    if (order?.mall_order_items) {
      for (const item of order.mall_order_items) {
        const { data: p } = await sb.from('mall_products').select('stock,sold_count').eq('id', item.product_id).single();
        if (p) await sb.from('mall_products').update({ stock: p.stock + item.quantity, sold_count: Math.max(0, p.sold_count - item.quantity) }).eq('id', item.product_id);
      }
    }
    await sb.from('mall_orders').update({ status: 'return_completed' }).eq('id', orderId);
    Mall.toast('반품 완료 처리됐습니다. 재고가 복구됐습니다.', 'success');
    nav('returns', null);
    _loadBadges();
  }

  // ── 1:1 문의 ────────────────────────────────────────────────
  async function _pageInquiries(el) {
    const { data } = await sb.from('mall_inquiries').select('*').order('created_at', { ascending: false });
    el.innerHTML = `
    <div class="ap-title">❓ 1:1 문의</div>
    <div class="ap-desc">고객 문의에 답변합니다. 미답변 항목이 배지로 표시됩니다.</div>
    ${(data||[]).map(q=>`
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px;">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap;">
        <span style="font-size:.8rem;font-weight:500;">${q.nickname||'익명'}</span>
        <span style="font-size:.75rem;background:rgba(0,212,255,.1);color:var(--accent);border-radius:4px;padding:2px 8px;">${q.type}</span>
        ${!q.answer?'<span style="font-size:.72rem;color:var(--accent2);font-weight:700;">미답변</span>':''}
        <span style="font-size:.72rem;color:var(--text-dim);margin-left:auto;">${_dateStr(q.created_at)}</span>
      </div>
      <div style="font-size:.88rem;font-weight:500;margin-bottom:4px;">${q.title}</div>
      <div style="font-size:.83rem;color:var(--text-dim);margin-bottom:8px;">${q.content}</div>
      ${q.answer ? `<div style="background:rgba(0,212,255,.06);border-left:2px solid var(--accent);padding:6px 10px;font-size:.82rem;border-radius:0 6px 6px 0;">💬 ${q.answer}</div>` : ''}
      ${!q.answer ? `
      <div style="display:flex;gap:8px;margin-top:8px;">
        <input class="form-input" id="ans-${q.id}" placeholder="답변 내용 입력..." style="flex:1;">
        <button class="btn-save" style="padding:8px 14px;" onclick="AdminPanel.answerInquiry('${q.id}')">답변</button>
        <button class="btn-danger" style="padding:8px 14px;" onclick="AdminPanel.hideInquiry('${q.id}')">숨김</button>
      </div>` : ''}
    </div>`).join('')}`;
  }
  async function answerInquiry(id) {
    const ans = document.getElementById(`ans-${id}`)?.value.trim();
    if (!ans) return;
    await sb.from('mall_inquiries').update({ answer: ans, answered_at: new Date().toISOString() }).eq('id', id);
    Mall.toast('답변이 등록됐습니다.', 'success');
    nav('inquiries', null);
    _loadBadges();
  }
  async function hideInquiry(id) {
    await sb.from('mall_inquiries').update({ is_visible: false }).eq('id', id);
    Mall.toast('문의가 숨겨졌습니다.', 'success');
    nav('inquiries', null);
  }

  // ── 후기 관리 ────────────────────────────────────────────────
  async function _pageReviews(el) {
    const { data } = await sb.from('mall_reviews').select('*, mall_products(name)').order('created_at', { ascending: false });
    el.innerHTML = `
    <div class="ap-title">⭐ 후기 관리</div>
    <div class="ap-desc">후기를 노출/숨김 처리할 수 있습니다.</div>
    <table class="admin-table">
      <thead><tr><th>상품</th><th>작성자</th><th>별점</th><th>내용</th><th>상태</th><th>날짜</th><th>관리</th></tr></thead>
      <tbody>${(data||[]).map(r=>`
      <tr>
        <td style="font-size:.8rem;">${r.mall_products?.name||'—'}</td>
        <td>${r.nickname||'익명'}</td>
        <td style="color:var(--gold);">${'⭐'.repeat(r.rating||0)}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.82rem;">${r.content||''}</td>
        <td><span class="${r.is_visible?'stock-ok':'stock-warn'}">${r.is_visible?'노출':'숨김'}</span></td>
        <td style="font-size:.75rem;">${_dateStr(r.created_at)}</td>
        <td><button class="oact-btn" style="font-size:.72rem;padding:4px 8px;" onclick="AdminPanel.toggleReview('${r.id}',${!r.is_visible})">${r.is_visible?'숨김':'노출'}</button></td>
      </tr>`).join('')}</tbody>
    </table>`;
  }
  async function toggleReview(id, visible) {
    await sb.from('mall_reviews').update({ is_visible: visible }).eq('id', id);
    nav('reviews', null);
  }

  // ── 블랙리스트 ───────────────────────────────────────────────
  async function _pageBlacklist(el) {
    const { data } = await sb.from('mall_blacklist').select('*, user_profiles(nickname,phone)');
    el.innerHTML = `
    <div class="ap-title">🚫 블랙리스트</div>
    <div class="ap-desc">악성 구매자를 관리합니다. 블랙리스트 유저는 쇼핑몰 접근이 제한됩니다.</div>
    <div style="display:flex;gap:8px;margin-bottom:16px;">
      <input class="form-input" id="bl-uid" placeholder="유저 ID 또는 닉네임" style="max-width:280px;">
      <input class="form-input" id="bl-reason" placeholder="사유" style="max-width:200px;">
      <button class="btn-danger" onclick="AdminPanel.addBlacklist()">추가</button>
    </div>
    <table class="admin-table">
      <thead><tr><th>닉네임</th><th>전화</th><th>사유</th><th>등록일</th><th>관리</th></tr></thead>
      <tbody>${(data||[]).map(b=>`
      <tr>
        <td>${b.user_profiles?.nickname||b.user_id}</td>
        <td>${b.user_profiles?.phone||'—'}</td>
        <td>${b.reason||'—'}</td>
        <td style="font-size:.75rem;">${_dateStr(b.created_at)}</td>
        <td><button class="oact-btn danger" style="font-size:.72rem;padding:4px 8px;" onclick="AdminPanel.removeBlacklist(${b.id})">해제</button></td>
      </tr>`).join('')}</tbody>
    </table>`;
  }
  async function addBlacklist() {
    const uid = document.getElementById('bl-uid')?.value.trim();
    const reason = document.getElementById('bl-reason')?.value.trim();
    if (!uid) return;
    await sb.from('mall_blacklist').insert({ user_id: uid, reason, blocked_by: Mall.getUser()?.id });
    Mall.toast('블랙리스트에 추가됐습니다.', 'success');
    nav('blacklist', null);
  }
  async function removeBlacklist(id) {
    await sb.from('mall_blacklist').delete().eq('id', id);
    Mall.toast('블랙리스트에서 해제됐습니다.', 'success');
    nav('blacklist', null);
  }

  // ── 배송·원산지 설정 ────────────────────────────────────────
  function _pageSettingsShip(el) {
    const s = Mall.getSettings();
    el.innerHTML = `
    <div class="ap-title">🚚 배송·원산지 설정</div>
    <div class="ap-desc">여기서 설정한 내용은 <strong>모든 상품 상세 페이지 최하단에 자동으로 표시</strong>됩니다. 변경 즉시 모든 상품에 반영됩니다.</div>
    <div class="form-group">
      <label class="form-label">원산지 *</label>
      <div class="form-hint">예: 대한민국, 중국, 베트남 — 한국 법령상 표기 필수 항목입니다.</div>
      <input class="form-input" id="set-origin" value="${s.origin||'대한민국'}">
    </div>
    <div class="form-group">
      <label class="form-label">택배사 *</label>
      <div class="form-hint">예: CJ대한통운, 한진택배, 로젠택배</div>
      <input class="form-input" id="set-courier" value="${s.courier||'CJ대한통운'}">
    </div>
    <div class="form-group">
      <label class="form-label">배송조회 URL</label>
      <div class="form-hint">고객이 운송장 번호로 배송 추적을 할 수 있는 링크입니다.</div>
      <input class="form-input" id="set-couri-url" value="${s.courier_url||''}">
    </div>
    <div class="form-group">
      <label class="form-label">A/S 전화번호</label>
      <input class="form-input" id="set-as-phone" value="${s.as_phone||''}">
    </div>
    <div class="form-group">
      <label class="form-label">반품·교환 주소</label>
      <input class="form-input" id="set-as-addr" value="${s.as_address||''}">
    </div>
    <hr style="border-color:var(--border);margin:20px 0;">
    <div class="form-group">
      <label class="form-label">기본 배송비 (원)</label>
      <div class="form-hint">각 상품에서 '무료배송'을 체크하지 않은 경우 이 금액이 적용됩니다.</div>
      <input class="form-input" id="set-ship-fee" type="number" value="${s.ship_fee||3000}">
    </div>
    <div class="form-group">
      <label class="form-label">무료배송 기준 금액 (원)</label>
      <div class="form-hint">이 금액 이상 주문 시 무료배송. 0이면 항상 무료배송입니다.</div>
      <input class="form-input" id="set-free-min" type="number" value="${s.free_ship_min||50000}">
    </div>
    <div class="form-group">
      <label class="form-label">기본 반품배송비 (원)</label>
      <div class="form-hint">반품 시 기본 청구 금액입니다. 관리자가 주문별로 개별 조정 가능합니다.</div>
      <input class="form-input" id="set-ret-fee" type="number" value="${s.return_fee||5000}">
    </div>
    <div class="form-group">
      <label class="form-label">화물 반품배송비 (원)</label>
      <div class="form-hint">화물 상품으로 표시된 상품의 반품 시 기본 청구 금액입니다.</div>
      <input class="form-input" id="set-ret-cargo" type="number" value="${s.return_fee_cargo||10000}">
    </div>
    <div class="form-group">
      <label class="form-label">반품 가능 기간 (배송완료 후 일수)</label>
      <div class="form-hint">배송 완료 후 이 기간 이내에만 반품 요청 버튼이 노출됩니다. 기본값: 3일</div>
      <input class="form-input" id="set-ret-period" type="number" value="${s.return_period||3}" min="1">
    </div>
    <button class="btn-save" onclick="AdminPanel.saveShipSettings()">💾 저장 (전체 상품에 즉시 반영)</button>`;
  }

  async function saveShipSettings() {
    const pairs = [
      ['origin', 'set-origin'],
      ['courier', 'set-courier'],
      ['courier_url', 'set-couri-url'],
      ['as_phone', 'set-as-phone'],
      ['as_address', 'set-as-addr'],
      ['ship_fee', 'set-ship-fee'],
      ['free_ship_min', 'set-free-min'],
      ['return_fee', 'set-ret-fee'],
      ['return_fee_cargo', 'set-ret-cargo'],
      ['return_period', 'set-ret-period'],
    ];
    for (const [key, inputId] of pairs) {
      const val = document.getElementById(inputId)?.value;
      if (val !== undefined) await Mall.updateSettings(key, val);
    }
    Mall.toast('배송·원산지 설정이 저장됐습니다. 전체 상품에 즉시 반영됩니다.', 'success');
  }

  // ── 쇼핑몰 설정 ─────────────────────────────────────────────
  function _pageSettingsShop(el) {
    const s = Mall.getSettings();
    el.innerHTML = `
    <div class="ap-title">🏪 쇼핑몰 설정</div>
    <div class="ap-desc">쇼핑몰 전반적인 설정을 관리합니다.</div>
    <div class="form-group">
      <label class="form-label">상단 공지 메시지</label>
      <div class="form-hint">입력 시 쇼핑몰 상단에 공지 배너가 표시됩니다. 비워두면 숨겨집니다.</div>
      <input class="form-input" id="set-notice" value="${s.shop_notice||''}" placeholder="예: 🎉 신규 회원 특별 할인 진행 중!">
    </div>
    <button class="btn-save" onclick="AdminPanel.saveShopSettings()">💾 저장</button>`;
  }
  async function saveShopSettings() {
    await Mall.updateSettings('shop_notice', document.getElementById('set-notice')?.value || '');
    Mall.toast('설정이 저장됐습니다.', 'success');
  }

  // ── 유틸 ─────────────────────────────────────────────────────
  function _fmt(n) { return Number(n).toLocaleString('ko-KR'); }
  function _dateStr(d) { return d ? new Date(d).toLocaleDateString('ko-KR') : '—'; }
  function _statusLabel(s) {
    return {paid:'결제완료',preparing:'배송준비중',shipping:'배송중',
      delivered:'배송완료',confirmed:'구매확정',
      return_requested:'반품요청',return_reviewing:'반품심사중',
      return_shipping:'반품배송중',return_completed:'반품완료',cancelled:'취소'}[s]||s;
  }

  return {
    init, nav, onCatChange, calcSalePrice, addPartRow, addFashionOpt,
    previewThumb, previewExtraImgs, submitProduct, editProduct, deleteProduct,
    updateOrderStatus, inputTracking, searchOrders, viewOrder: (id) => console.log(id),
    chargeReturnFee, freeReturn, completeReturn,
    answerInquiry, hideInquiry, toggleReview,
    addBlacklist, removeBlacklist,
    saveShipSettings, saveShopSettings,
    edCmd, edInsertImg,
  };
})();

// ── 앱 시작 ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => Mall.init());
