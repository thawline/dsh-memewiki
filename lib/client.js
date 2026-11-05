/**
 * dsh-memewiki —— 浏览器半侧（手写的 __ModuleLoader__ bundle，无需构建工具）。
 *
 * 注册一个「梗百科」设置页（slot: settings.section）：
 *   - 看词库有多少条、搜词条；
 *   - 点开一条改「用法 / 出处 / 摘要 / 标签」；
 *   - 自己新建词条（标题 + 内容），马上生效（下一轮对话就能查到）。
 *
 * 与宿主端只走同源 HTTP（/api/memewiki/*），不碰 RPC。
 */

window.__ModuleLoader__.load({
  id: 'dsh-memewiki',
  /**
   * 工厂外面套一层 IIFE：子路径前缀必须在打包脚本求值时就算好 —— 工厂是延迟执行的，
   * 那时 document.currentScript 已经被 loader 摘掉了。
   */
  factory: (function () {
  /**
   * 子路径部署前缀（fnOS 等反代把 DSH 挂在 /app/<id>/ 下时）：插件自己的 HTTP 路由
   * /api/memewiki/* 也必须带同一前缀，否则请求会落到网关根目录的静态站上，拿回 404
   * 的 HTML，设置页只报「读词库失败：HTTP 404」。
   *
   * 前缀从加载本 bundle 的 <script src> 反推：地址形如 `<前缀>/plugins/??dsh-memewiki/client.js`，
   * 根路径部署时前缀是空串。
   */
  function detectAppBase(doc, href) {
    var strip = function (p) { return String(p || '').replace(/\/+$/, '') }
    var fromPath = function (p) {
      var m = /^(.*?)\/plugins\//.exec(String(p || ''))
      return m ? strip(m[1]) : null
    }
    if (!doc) return ''
    try {
      var src = doc.currentScript && doc.currentScript.src
      if (src) {
        var base = fromPath(new URL(src, doc.baseURI || href).pathname)
        if (base !== null) return base
      }
    } catch (e) { /* 非浏览器 / 非脚本方式加载 */ }
    try {
      var list = doc.querySelectorAll('script[src]')
      for (var i = 0; i < list.length; i++) {
        var one = fromPath(new URL(list[i].src, doc.baseURI || href).pathname)
        if (one !== null) return one
      }
    } catch (e) { /* 极简 DOM 没有完整查询能力 */ }
    // 兜底：页面本身就在应用根（DSH 的会话选择走 query/hash，pathname 不会深入）
    try {
      var path = new URL(doc.baseURI).pathname
      if (path.charAt(path.length - 1) === '/') return strip(path)
    } catch (e) { /* 无 document.baseURI */ }
    return ''
  }
  var APP_BASE = detectAppBase(
    typeof document === 'undefined' ? null : document,
    typeof location === 'undefined' ? '' : location.href
  )
  /** 站内根绝对路径补应用前缀；外部 URL、协议相对、blob:/data: 原样返回。 */
  function absAppPath(u) {
    var s = String(u == null ? '' : u)
    if (!s || s.charAt(0) !== '/' || s.charAt(1) === '/') return s
    if (!APP_BASE || s === APP_BASE || s.indexOf(APP_BASE + '/') === 0) return s
    return APP_BASE + s
  }

  return function (require) {
    var module = { exports: {} }
    var exports = module.exports

    var React = require('react')
    var h = React.createElement
    var Component = React.Component
    var useCallback = React.useCallback
    var useEffect = React.useEffect
    var useMemo = React.useMemo
    var useState = React.useState
    var Fragment = React.Fragment

    // 站内绝对路径补应用前缀：子路径部署时 /api/memewiki 会被打到网关根目录（404）
    var API = absAppPath('/api/memewiki')

    // ---- 同源 API ---------------------------------------------------------

    function readJson(res) {
      return res.text().then(function (text) {
        var data = null
        try { data = text === '' ? null : JSON.parse(text) } catch (e) { data = null }
        if (!res.ok) {
          var msg = data && data.error ? data.error : ('HTTP ' + res.status)
          throw new Error(msg)
        }
        return data
      })
    }
    function apiGet(path) {
      return fetch(API + path, { cache: 'no-store' }).then(readJson)
    }
    function apiPost(path, body) {
      return fetch(API + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
      }).then(readJson)
    }

    // ---- 样式 -------------------------------------------------------------

    var CSS = [
      '.mw-root{display:flex;flex-direction:column;gap:14px;padding:4px 2px 24px;min-width:0;font-size:13px}',
      '.mw-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '.mw-title{font-size:15px;font-weight:600}',
      '.mw-sub{opacity:.62;font-size:12px}',
      '.mw-search{display:flex;gap:8px;flex:1;min-width:220px}',
      '.mw-input{flex:1;min-width:0;padding:7px 10px;border-radius:8px;border:1px solid rgba(127,127,127,.34);background:transparent;color:inherit;font:inherit;outline:none}',
      '.mw-input:focus{border-color:rgba(120,170,255,.8)}',
      '.mw-btn{padding:7px 12px;border-radius:8px;border:1px solid rgba(127,127,127,.34);background:transparent;color:inherit;font:inherit;cursor:pointer;white-space:nowrap}',
      '.mw-btn:hover{background:rgba(127,127,127,.12)}',
      '.mw-btn.primary{border-color:rgba(120,170,255,.75);background:rgba(120,170,255,.16)}',
      '.mw-btn.danger{border-color:rgba(255,110,110,.5);color:rgba(255,130,130,.95)}',
      '.mw-list{display:flex;flex-direction:column;border:1px solid rgba(127,127,127,.22);border-radius:10px;overflow:hidden;max-height:46vh;overflow-y:auto}',
      '.mw-row{display:flex;align-items:flex-start;gap:10px;padding:9px 11px;border-bottom:1px solid rgba(127,127,127,.14)}',
      '.mw-row:last-child{border-bottom:none}',
      '.mw-row:hover{background:rgba(127,127,127,.08)}',
      '.mw-row-main{flex:1;min-width:0}',
      '.mw-name{font-weight:600;margin-bottom:2px}',
      '.mw-tags{font-size:11px;opacity:.6;margin-left:6px;font-weight:400}',
      '.mw-desc{font-size:12px;opacity:.72;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.mw-empty{padding:18px;text-align:center;opacity:.55}',
      '.mw-edit{border:1px solid rgba(127,127,127,.28);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:9px;background:rgba(127,127,127,.05)}',
      '.mw-field{display:flex;flex-direction:column;gap:4px}',
      '.mw-field label{font-size:12px;opacity:.68}',
      '.mw-area{min-height:64px;resize:vertical;font:inherit;line-height:1.5;padding:7px 9px;border-radius:8px;border:1px solid rgba(127,127,127,.34);background:transparent;color:inherit;outline:none}',
      '.mw-area:focus{border-color:rgba(120,170,255,.8)}',
      '.mw-actions{display:flex;gap:8px;justify-content:flex-end}',
      '.mw-note{font-size:12px;padding:8px 10px;border-radius:8px;background:rgba(120,170,255,.12);border:1px solid rgba(120,170,255,.28)}',
      '.mw-note.err{background:rgba(255,110,110,.12);border-color:rgba(255,110,110,.4)}',
      '.mw-pager{display:flex;align-items:center;gap:10px;justify-content:center;font-size:12px;opacity:.8}',
      '.mw-toggle{display:flex;flex-direction:column;gap:4px;padding:10px 12px;border-radius:10px;border:1px solid rgba(127,127,127,.22);background:rgba(127,127,127,.05)}',
      '.mw-check{display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600}',
      '.mw-check input{width:15px;height:15px;cursor:pointer}',
      '.mw-slider{display:flex;align-items:center;gap:10px;margin-top:8px}',
      '.mw-slider input[type=range]{flex:1;cursor:pointer}',
      '.mw-slider span{font-size:12px;opacity:.85;white-space:nowrap}',
      '.mw-tabs{display:flex;gap:6px;padding:0 0 2px}',
      '.mw-tab{padding:6px 13px;border-radius:8px;border:1px solid transparent;background:transparent;color:inherit;font:inherit;font-size:12.5px;cursor:pointer;opacity:.62}',
      '.mw-tab:hover{background:rgba(127,127,127,.1);opacity:.9}',
      '.mw-tab.active{opacity:1;border-color:rgba(120,170,255,.45);background:rgba(120,170,255,.14);font-weight:600}',
      '.mw-about{display:flex;flex-direction:column;gap:18px;padding:20px 2px 24px;max-width:720px}',
      '.mw-hero{display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:14px;border:1px solid rgba(127,127,127,.22);background:linear-gradient(135deg,rgba(120,170,255,.15),rgba(127,127,127,.05))}',
      '.mw-logo{width:58px;height:58px;border-radius:15px;display:flex;align-items:center;justify-content:center;font-size:29px;line-height:1;background:rgba(120,170,255,.17);border:1px solid rgba(120,170,255,.36);flex:none}',
      '.mw-hero-name{font-size:17px;font-weight:650;line-height:1.25}',
      '.mw-hero-meta{font-size:12px;opacity:.6;margin-top:3px}',
      '.mw-sec{display:flex;flex-direction:column;gap:8px}',
      '.mw-sec-h{font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px}',
      '.mw-p{margin:0;font-size:12.5px;line-height:1.72;opacity:.8}',
      '.mw-links{display:flex;flex-wrap:wrap;gap:8px;align-items:center}',
      '.mw-url{display:block;padding:7px 9px;border-radius:8px;border:1px dashed rgba(127,127,127,.35);background:rgba(127,127,127,.06);font-size:12px;line-height:1.4;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;user-select:text}',
      '.mw-credits{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;font-size:12.5px;line-height:1.65;opacity:.82}',
      '.mw-source{padding:11px 13px;border-radius:10px;border:1px solid rgba(120,170,255,.3);background:rgba(120,170,255,.1);display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:12.5px}',
      '.mw-source-label{opacity:.85}',
      '.mw-foot{text-align:center;font-size:12px;opacity:.55;padding:2px 0 8px}',
    ].join('\n')

    function 串子档(v) {
      if (v <= 20) return '很低：很尊重，黑称不接'
      if (v <= 45) return '偏低：损操作可以，损长相不行'
      if (v <= 70) return '中等：跟着社区玩'
      return '很高：放开串，黑称也玩'
    }

    // ---- 设置页 -----------------------------------------------------------

    var PAGE = 40

    function About(props) {
      var 版 = props.版本 || ''
      var 条数 = props.词条数 || 0
      var 建于 = props.builtAt || ''
      var 仓库 = 'https://github.com/thawline/dsh-memewiki'
      var 简介 = 条数
        ? '把 ' + 条数 + ' 条网络梗、缩写和黑话装进一个本地 SQLite 词库。'
        : '把网络梗、缩写和黑话装进一个本地 SQLite 词库。'
      return h('div', { className: 'mw-about' },
        h('div', { className: 'mw-hero' },
          h('div', { className: 'mw-logo' }, '🐳'),
          h('div', null,
            h('div', { className: 'mw-hero-name' }, '梗百科'),
            h('div', { className: 'mw-hero-meta' },
              'dsh-memewiki' +
              (版 ? ' · v' + 版 : '') +
              (条数 ? ' · ' + 条数 + ' 条词条' : '') +
              (建于 ? ' · 词库建于 ' + 建于 : '')),
          ),
        ),

        h('div', { className: 'mw-sec' },
          h('div', { className: 'mw-sec-h' }, '📖 项目简介'),
          h('p', { className: 'mw-p' },
            简介 + '你问「XX 是什么梗」的时候，它会在模型看到这句话之前先把词条查好塞进上下文，让模型直接接梗，不用硬猜。'),
          h('p', { className: 'mw-p' },
            '查词、注入全在本地，不联网、零依赖，只用 Node 自带的 node:sqlite。词条还能在设置页里自己增删改，改完下一轮对话就生效。'),
        ),

        h('div', { className: 'mw-sec' },
          h('div', { className: 'mw-sec-h' }, '⭐ 开源与支持'),
          h('p', { className: 'mw-p' },
            '项目以 MIT 协议开源，完全免费。如果它帮你接住了一个梗，去仓库点一颗 ⭐ 就是最直接的鼓励。'),
          h('div', { className: 'mw-links' },
            h('a', { className: 'mw-btn primary', href: 仓库, target: '_blank', rel: 'noopener noreferrer' }, '⭐ 去 GitHub 点亮 Star'),
            h('a', { className: 'mw-btn', href: 仓库 + '/issues', target: '_blank', rel: 'noopener noreferrer' }, '提 Issue / PR'),
          ),
          h('p', { className: 'mw-p' }, '仓库地址（按钮打不开时手动复制）：'),
          h('code', { className: 'mw-url' }, 仓库),
          h('p', { className: 'mw-p' },
            '遇到查不到的梗、错漏的释义，或者想要新功能，都欢迎来仓库说一声 —— 梗是大家一起补的。'),
        ),

        h('div', { className: 'mw-sec' },
          h('div', { className: 'mw-sec-h' }, '🙏 致谢'),
          h('p', { className: 'mw-p' }, '这个插件能接住梗，靠的是这些人和这些地方：'),
          h('ul', { className: 'mw-credits' },
            h('li', null, '🌐 梗维基 —— 词库的全部词条（来源、用法、标签、别名）都来自站上整理的内容'),
            h('li', null, '🧩 in1t1a1 —— 原 AstrBot 插件 astrbot_plugin_memewiki 的作者，本插件从它移植而来'),
            h('li', null, '🛠️ DSH 官方 —— 插件体系、设置页插槽，还有 node:sqlite 的底子'),
          ),
          h('div', { className: 'mw-source' },
            h('span', { className: 'mw-source-label' }, '梗维基原网站：'),
            h('a', { href: 'https://cnmeme.wiki', target: '_blank', rel: 'noopener noreferrer' }, 'https://cnmeme.wiki'),
          ),
        ),

        h('div', { className: 'mw-foot' }, '💌 谢谢每一位还在用「梗百科」的你 —— 下次群里冒出怪词，别慌，先问我。'),
      )
    }

    function Section(props) {
      var [q, setQ] = useState('')
      var [items, setItems] = useState([])
      var [total, setTotal] = useState(0)
      var [offset, setOffset] = useState(0)
      var [stats, setStats] = useState(null)
      var [editing, setEditing] = useState(null)
      var [busy, setBusy] = useState(false)
      var [msg, setMsg] = useState(null)
      var [auto, setAuto] = useState(true)
      var [串子开, set串子开] = useState(false)
      var [串子度, set串子度] = useState(50)
      var [版本, set版本] = useState('')
      var [更新, set更新] = useState(null)
      var [查更新中, set查更新中] = useState(false)
      var [视图, set视图] = useState('list')

      var load = useCallback(function (query, off) {
        setBusy(true)
        apiGet('/list?q=' + encodeURIComponent(query || '') + '&limit=' + PAGE + '&offset=' + (off || 0))
          .then(function (d) {
            setItems((d && d.items) || [])
            setTotal((d && d.total) || 0)
            setOffset(off || 0)
            setMsg(null)
          })
          .catch(function (e) { setMsg({ kind: 'err', text: '读词库失败：' + e.message }) })
          .then(function () { setBusy(false) })
      }, [])

      useEffect(function () {
        apiGet('/state').then(function (d) {
          setStats(d)
          set版本((d && d.版本) || '')
          setAuto(d && typeof d.自动思考梗 === 'boolean' ? d.自动思考梗 : true)
          set串子开(!!(d && d.串子开关))
          set串子度(d && typeof d.串子程度 === 'number' ? d.串子程度 : 50)
        }).catch(function () {})
        load('', 0)
      }, [])

      function 检查更新() {
        set查更新中(true)
        set更新(null)
        apiGet('/check-update')
          .then(function (d) {
            set更新(d || { ok: false, error: '没拿到结果' })
            if (d && d.ok) set版本(d.当前 || 版本)
          })
          .catch(function (e) { set更新({ ok: false, error: e.message }) })
          .then(function () { set查更新中(false) })
      }

      function 切换串子() {
        var 下一个 = !串子开
        set串子开(下一个)
        apiPost('/config', { 串子开关: 下一个, 串子程度: 串子度 })
          .then(function (d) {
            set串子开(!!(d && d.串子开关))
            setMsg({
              kind: 'ok',
              text: 下一个
                ? '串子程度：接管了。以后玩梗的尺度按你拉的这根杆来。'
                : '串子程度：关。以后玩梗我自己判断，看它冲谁去。',
            })
          })
          .catch(function (e) { set串子开(!下一个); setMsg({ kind: 'err', text: '改不了：' + e.message }) })
      }

      function 存串子度(值) {
        var v = Math.max(0, Math.min(100, Math.round(值)))
        set串子度(v)
        apiPost('/config', { 串子开关: 串子开, 串子程度: v })
          .then(function (d) { set串子度(d && typeof d.串子程度 === 'number' ? d.串子程度 : v) })
          .catch(function (e) { setMsg({ kind: 'err', text: '改不了：' + e.message }) })
      }

      function 切换自动() {
        var 下一个 = !auto
        setAuto(下一个)
        apiPost('/config', { 自动思考梗: 下一个 })
          .then(function (d) {
            setAuto(!!(d && d.自动思考梗))
            setMsg({ kind: 'ok', text: 下一个 ? '自动思考梗：开。以后我察觉你在问梗，会自己去查。' : '自动思考梗：关。以后我不主动查，你叫我查我才查。' })
          })
          .catch(function (e) { setAuto(!下一个); setMsg({ kind: 'err', text: '改不了：' + e.message }) })
      }

      function 搜索() { load(q, 0) }

      function 新建() {
        setEditing({ title: '', 原标题: '', tags: '', usage: '', origin: '', summary: '', aliases: '', isNew: true })
        setMsg(null)
      }

      function 编辑(it) {
        setMsg(null)
        var 用行 = function (row) {
          setEditing({
            title: row.title,
            原标题: row.title,
            tags: row.tags || '',
            usage: row.usage || '',
            origin: row.origin || '',
            summary: row.summary || '',
            aliases: row.aliases || '',
            isNew: false,
          })
        }
        // 列表里带不全所有字段，编辑前先按标题拉一次完整词条（别名就丢在这上面过）
        apiGet('/get?title=' + encodeURIComponent(it.title))
          .then(function (d) { 用行((d && d.item) || it) })
          .catch(function () { 用行(it) })
      }

      function 保存() {
        if (!editing) return
        var title = String(editing.title || '').trim()
        if (!title) { setMsg({ kind: 'err', text: '标题不能空' }); return }
        setBusy(true)
        apiPost('/save', editing)
          .then(function () {
            setMsg({ kind: 'ok', text: '存好了：' + title })
            setEditing(null)
            load(q, offset)
          })
          .catch(function (e) { setMsg({ kind: 'err', text: '保存失败：' + e.message }) })
          .then(function () { setBusy(false) })
      }

      function 删除(it) {
        if (!it) return
        if (!window.confirm('删掉「' + it.title + '」？撤不回来。')) return
        setBusy(true)
        apiPost('/delete', { title: it.title })
          .then(function () {
            setMsg({ kind: 'ok', text: '删了：' + it.title })
            load(q, offset)
          })
          .catch(function (e) { setMsg({ kind: 'err', text: '删除失败：' + e.message }) })
          .then(function () { setBusy(false) })
      }

      var 共 = stats && typeof stats.total === 'number' ? stats.total : total
      var 页数 = Math.max(1, Math.ceil(total / PAGE))
      var 第几页 = Math.floor(offset / PAGE) + 1

      var 列表区 = h(Fragment, null,
        更新
          ? h('div', { className: 'mw-note' + (更新.ok === false || 更新.有更新 ? ' err' : '') },
              !更新.ok
                ? '检查更新失败：' + (更新.error || '不知道为啥')
                : 更新.有更新
                  ? '有新版本：v' + 更新.最新 + '（你现在 v' + 更新.当前 + '）→ ' + (更新.仓库 || '去 GitHub 拉新版')
                  : '已经是最新版本：v' + 更新.当前,
            )
          : null,

        msg ? h('div', { className: 'mw-note' + (msg.kind === 'err' ? ' err' : '') }, msg.text) : null,

        h('div', { className: 'mw-toggle' },
          h('label', { className: 'mw-check' },
            h('input', { type: 'checkbox', checked: auto, onChange: 切换自动 }),
            h('span', null, '自动思考梗'),
          ),
          h('div', { className: 'mw-sub' },
            auto
              ? '开着：我察觉到你在问梗，会自己去词库查好再接话（每轮带一小段接梗规则）。'
              : '关着：我不主动查。想知道某个梗，直接说「查一下 xxx」或者问我，我再动手。',
          ),
        ),

        h('div', { className: 'mw-toggle' },
          h('label', { className: 'mw-check' },
            h('input', { type: 'checkbox', checked: 串子开, onChange: 切换串子 }),
            h('span', null, '串子程度（手动接管玩梗尺度）'),
          ),
          h('div', { className: 'mw-sub' },
            串子开
              ? '开着：玩梗的尺度按下面这根杆来。'
              : '关着：我自己判断——可以损技术、损操作，不损家人。',
          ),
          串子开
            ? h('div', { className: 'mw-slider' },
                h('input', {
                  type: 'range',
                  min: 0,
                  max: 100,
                  step: 5,
                  value: 串子度,
                  onChange: function (e) { set串子度(Number(e.target.value)) },
                  onMouseUp: function (e) { 存串子度(Number(e.target.value)) },
                  onTouchEnd: function (e) { 存串子度(Number(e.target.value)) },
                }),
                h('span', null, 串子度 + ' / 100 · ' + 串子档(串子度)),
              )
            : null,
        ),

        editing
          ? h(Editor, {
              value: editing,
              busy: busy,
              onChange: setEditing,
              onSave: 保存,
              onCancel: function () { setEditing(null); setMsg(null) },
            })
          : null,

        h('div', { className: 'mw-list' },
          items.length === 0
            ? h('div', { className: 'mw-empty' }, busy ? '读着…' : (q ? '没搜到「' + q + '」' : '词库是空的'))
            : items.map(function (it) {
                return h('div', { className: 'mw-row', key: it.title },
                  h('div', { className: 'mw-row-main' },
                    h('div', { className: 'mw-name' }, it.title,
                      it.tags ? h('span', { className: 'mw-tags' }, it.tags) : null),
                    h('div', { className: 'mw-desc' }, it.summary || it.usage || it.origin || '（还没写内容）'),
                  ),
                  h('div', { style: { display: 'flex', gap: '6px' } },
                    h('button', { className: 'mw-btn', onClick: function () { 编辑(it) } }, '改'),
                    h('button', { className: 'mw-btn danger', onClick: function () { 删除(it) } }, '删'),
                  ),
                )
              }),
        ),

        页数 > 1
          ? h('div', { className: 'mw-pager' },
              h('button', { className: 'mw-btn', disabled: busy || offset === 0, onClick: function () { load(q, Math.max(0, offset - PAGE)) } }, '上一页'),
              h('span', null, 第几页 + ' / ' + 页数 + ' 页 · 共 ' + total + ' 条'),
              h('button', { className: 'mw-btn', disabled: busy || offset + PAGE >= total, onClick: function () { load(q, offset + PAGE) } }, '下一页'),
            )
          : null,
      )

      return h('div', { className: 'mw-root' },
        h('div', { className: 'mw-top' },
          h('div', null,
            h('div', { className: 'mw-title' }, '梗百科' + (版本 ? ' · v' + 版本 : '')),
            h('div', { className: 'mw-sub' },
              '词库 ' + 共 + ' 条' + (stats && stats.builtAt ? ' · 建于 ' + stats.builtAt : '') +
              (stats && stats.writable === false ? ' · 只读' : '') +
              ' · 新加的词条下一轮对话就能查到'),
          ),
          视图 === 'list'
            ? h('div', { className: 'mw-search' },
                h('input', {
                  className: 'mw-input',
                  value: q,
                  placeholder: '搜标题 / 标签 / 摘要…',
                  onChange: function (e) { setQ(e.target.value) },
                  onKeyDown: function (e) { if (e.key === 'Enter') 搜索() },
                }),
                h('button', { className: 'mw-btn', onClick: 搜索, disabled: busy }, '搜'),
                h('button', { className: 'mw-btn primary', onClick: 新建 }, '＋ 新建词条'),
                h('button', { className: 'mw-btn', onClick: 检查更新, disabled: 查更新中 }, 查更新中 ? '查…' : '检查更新'),
              )
            : null,
        ),

        h('div', { className: 'mw-tabs' },
          h('button', {
            className: 'mw-tab' + (视图 === 'list' ? ' active' : ''),
            onClick: function () { set视图('list') },
          }, '词条库'),
          h('button', {
            className: 'mw-tab' + (视图 === 'about' ? ' active' : ''),
            onClick: function () { set视图('about') },
          }, '关于'),
        ),

        视图 === 'about'
          ? h(About, {
              版本: 版本,
              词条数: 共,
              builtAt: stats && stats.builtAt,
            })
          : 列表区,
      )
    }

    function Editor(props) {
      var v = props.value
      function 改(k) {
        return function (e) {
          var next = Object.assign({}, v)
          next[k] = e.target.value
          props.onChange(next)
        }
      }
      return h('div', { className: 'mw-edit' },
        h('div', { className: 'mw-field' },
          h('label', null, '标题（梗名 / 黑话；改名会同时更新索引）'),
          h('input', {
            className: 'mw-input',
            value: v.title,
            placeholder: '比如：去码头整点薯条',
            onChange: 改('title'),
          }),
        ),
        h('div', { className: 'mw-field' },
          h('label', null, '标签（空格或逗号隔开都行）'),
          h('input', { className: 'mw-input', value: v.tags, placeholder: '比如：海鸥 人生意义', onChange: 改('tags') }),
        ),
        h('div', { className: 'mw-field' },
          h('label', null, '别名（逗号隔开，打这个词也能查到；缩写就填这儿）'),
          h('input', { className: 'mw-input', value: v.aliases, placeholder: '比如：kskbl,zdjd,wkzkbl', onChange: 改('aliases') }),
        ),
        h('div', { className: 'mw-field' },
          h('label', null, '怎么用 / 怎么接（模型优先看这一段）'),
          h('textarea', { className: 'mw-area', value: v.usage, onChange: 改('usage') }),
        ),
        h('div', { className: 'mw-field' },
          h('label', null, '出处 / 来历'),
          h('textarea', { className: 'mw-area', value: v.origin, onChange: 改('origin') }),
        ),
        h('div', { className: 'mw-field' },
          h('label', null, '摘要（列表里显示的一行解释）'),
          h('textarea', { className: 'mw-area', style: { minHeight: '44px' }, value: v.summary, onChange: 改('summary') }),
        ),
        h('div', { className: 'mw-actions' },
          h('button', { className: 'mw-btn', onClick: props.onCancel, disabled: props.busy }, '取消'),
          h('button', { className: 'mw-btn primary', onClick: props.onSave, disabled: props.busy }, props.busy ? '存着…' : '保存'),
        ),
      )
    }

    /** 设置页错误边界：崩了也要看得见原因，别整块白屏。 */
    class ErrorBoundary extends Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }
      static getDerivedStateFromError(error) {
        return { error: error }
      }
      componentDidCatch(error) {
        console.error('[dsh-memewiki] 设置页渲染失败：', error)
      }
      render() {
        if (this.state.error) {
          var msg = this.state.error && this.state.error.message ? this.state.error.message : String(this.state.error)
          return h('div', { className: 'mw-root' },
            h('div', { className: 'mw-note err' }, '这个设置页渲染时出错了：' + msg),
          )
        }
        return this.props.children
      }
    }

    // ---- 注册 -------------------------------------------------------------

    function apply(ctx) {
      ctx.effect(function () {
        var id = 'dsh-memewiki-styles'
        if (document.getElementById(id) === null) {
          var style = document.createElement('style')
          style.id = id
          style.textContent = CSS
          document.head.appendChild(style)
        }
        return function () {
          var el = document.getElementById(id)
          if (el !== null && el.parentNode !== null) el.parentNode.removeChild(el)
        }
      }, 'dsh-memewiki: styles')

      ctx.slots.inject('settings.section', function () {
        return ctx.slots.register({
          name: 'settings.section',
          id: 'memewiki',
          order: 47,
          label: function () { return '梗百科' },
        }, function (props) {
          var p = props !== null && props !== undefined ? props : {}
          return h(ErrorBoundary, null, h(Section, p))
        })
      })
    }

    module.exports = {
      name: 'memewiki',
      inject: ['slots'],
      apply: apply,
    }
    return module.exports
  }
  })(),
})
