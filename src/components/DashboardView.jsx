import { useState, useEffect, useRef } from 'react'
import {
  UserCircleIcon,
  GaugeIcon,
  CreditCardIcon,
  HelpCircleIcon,
  SearchIcon,
  CheckIcon,
  PulseIcon,
  RefreshIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileSpreadsheetIcon,
  MessageSquareIcon,
} from './Icons'
import { apiUrl } from '../services/api'
import { exportToExcelCSV, downloadJsonFile } from './admin/helpers.jsx'
import { UrgencyBadge } from './admin/UrgencyBadge.jsx'
import ConversationDetailModal from './admin/ConversationDetailModal.jsx'
import FeedbackDetailModal from './admin/FeedbackDetailModal.jsx'
import './DashboardView.css'

export default function DashboardView({ account, onBack, onSignOut }) {
  const [activeTab, setActiveTab] = useState('overview')
  const isAdmin = account.role === 'admin'


  // State các dữ liệu quản trị
  const [overviewStats, setOverviewStats] = useState(null)
  const [conversations, setConversations] = useState([])
  const [searchConv, setSearchConv] = useState('')
  const [filterUrgency, setFilterUrgency] = useState('')
  const [filterLang, setFilterLang] = useState('')
  const [filterGuest, setFilterGuest] = useState('')
  const [convPage, setConvPage] = useState(1)
  const [totalConvPages, setTotalConvPages] = useState(1)
  
  // Chi tiết hội thoại đang xem
  const [selectedConv, setSelectedConv] = useState(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [flagReason, setFlagReason] = useState('')
  const [showFlagInput, setShowFlagInput] = useState(false)

  // Danh sách log an toàn & Ops
  const [safetyLogs, setSafetyLogs] = useState([])
  const [opsLogs, setOpsLogs] = useState(null)

  // Quản lý User (Cũ)
  const [users, setUsers] = useState([])
  const [searchUser, setSearchUser] = useState('')
  const [userPage, setUserPage] = useState(1)
  const [totalUserPages, setTotalUserPages] = useState(1)
  const [editingUserId, setEditingUserId] = useState(null)
  const [editPlan, setEditPlan] = useState('free')
  const [editRole, setEditRole] = useState('user')

  // Quản lý Thanh toán & Doanh thu
  const [payments, setPayments] = useState([])
  const [payPage, setPayPage] = useState(1)
  const [totalPayPages, setTotalPayPages] = useState(1)
  const [filterPayStatus, setFilterPayStatus] = useState('')
  const [filterPayGateway, setFilterPayGateway] = useState('')

  // Quản lý Phản hồi / Góp ý
  const [feedbacks, setFeedbacks] = useState([])
  const [fbPage, setFbPage] = useState(1)
  const [totalFbPages, setTotalFbPages] = useState(1)
  const [filterFbStatus, setFilterFbStatus] = useState('')
  const [filterFbCategory, setFilterFbCategory] = useState('')
  const [searchFb, setSearchFb] = useState('')
  const [selectedFb, setSelectedFb] = useState(null)
  const [showFbDetail, setShowFbDetail] = useState(false)
  const [fbReplyText, setFbReplyText] = useState('')
  const [fbNotesText, setFbNotesText] = useState('')
  const [fbStatusUpdate, setFbStatusUpdate] = useState('')
  const [fbSaving, setFbSaving] = useState(false)

  const [loading, setLoading] = useState(false)
  // Monotonic token: responses from superseded requests are discarded so a
  // slow earlier reply can never overwrite fresher data.
  const fetchSeqRef = useRef(0)

  // Hàm tải lại dữ liệu Admin cho tab hiện tại
  const fetchAdminData = async () => {
    if (!isAdmin) return
    setLoading(true)
    const seq = ++fetchSeqRef.current
    try {
      if (activeTab === 'overview') {
        const res = await fetch(apiUrl('/api/admin/stats/overview'))
        if (res.ok) {
          const data = await res.json()
          if (seq !== fetchSeqRef.current) return
          setOverviewStats(data.overview)
        }
      } else if (activeTab === 'conversations') {
        const queryParams = new URLSearchParams({
          page: convPage,
          limit: 8,
          search: searchConv,
          urgency: filterUrgency,
          lang: filterLang,
          isGuest: filterGuest
        })
        const res = await fetch(apiUrl(`/api/admin/conversations?${queryParams}`))
        if (res.ok) {
          const data = await res.json()
          if (seq !== fetchSeqRef.current) return
          setConversations(data.conversations || [])
          setTotalConvPages(data.pagination?.totalPages || 1)
        }
      } else if (activeTab === 'safety') {
        const res = await fetch(apiUrl('/api/admin/safety-logs'))
        if (res.ok) {
          const data = await res.json()
          if (seq !== fetchSeqRef.current) return
          setSafetyLogs(data.logs || [])
        }
      } else if (activeTab === 'users') {
        const res = await fetch(apiUrl(`/api/admin/users?page=${userPage}&search=${encodeURIComponent(searchUser)}`))
        if (res.ok) {
          const data = await res.json()
          if (seq !== fetchSeqRef.current) return
          setUsers(data.users || [])
          setTotalUserPages(data.pagination?.totalPages || 1)
        }
      } else if (activeTab === 'ops') {
        const res = await fetch(apiUrl('/api/admin/ops/logs'))
        if (res.ok) {
          const data = await res.json()
          if (seq !== fetchSeqRef.current) return
          setOpsLogs(data.ops)
        }
      } else if (activeTab === 'payments') {
        const queryParams = new URLSearchParams({
          page: payPage,
          limit: 8,
          status: filterPayStatus,
          gateway: filterPayGateway
        })
        const res = await fetch(apiUrl(`/api/admin/payments?${queryParams}`))
        if (res.ok) {
          const data = await res.json()
          if (seq !== fetchSeqRef.current) return
          setPayments(data.payments || [])
          setTotalPayPages(data.pagination?.totalPages || 1)
        }
      } else if (activeTab === 'feedbacks') {
        const queryParams = new URLSearchParams({
          page: fbPage,
          limit: 8,
          status: filterFbStatus,
          category: filterFbCategory,
          search: searchFb,
        })
        const res = await fetch(apiUrl(`/api/admin/feedbacks?${queryParams}`))
        if (res.ok) {
          const data = await res.json()
          if (seq !== fetchSeqRef.current) return
          setFeedbacks(data.feedbacks || [])
          setTotalFbPages(data.pagination?.totalPages || 1)
        }
      }
    } catch (err) {
      console.error('Lỗi khi lấy dữ liệu admin:', err)
    } finally {
      setLoading(false)
    }
  }

  // Tự động load dữ liệu tùy thuộc vào tab đang active
  useEffect(() => {
    fetchAdminData()
  // fetchAdminData is intentionally re-created with the current filter values.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, convPage, searchConv, filterUrgency, filterLang, filterGuest, userPage, searchUser, payPage, filterPayStatus, filterPayGateway, fbPage, searchFb, filterFbStatus, filterFbCategory, isAdmin])

  // Xem chi tiết hội thoại
  const handleViewDetails = async (convId) => {
    try {
      const res = await fetch(apiUrl(`/api/admin/conversations/${convId}`))
      if (res.ok) {
        const data = await res.json()
        setSelectedConv(data.conversation)
        setFlagReason(data.conversation.flaggedReason || '')
        setShowFlagInput(false)
        setShowDetailModal(true)
      }
    } catch {
      alert('Không thể tải chi tiết cuộc hội thoại.')
    }
  }

  // Gắn cờ/Gỡ cờ hội thoại
  const handleToggleFlag = async () => {
    if (!selectedConv) return
    const nextFlag = !selectedConv.flagged
    try {
      const res = await fetch(apiUrl(`/api/admin/conversations/${selectedConv.id}/flag`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flagged: nextFlag, flaggedReason: flagReason })
      })
      if (res.ok) {
        const data = await res.json()
        setSelectedConv(data.conversation)
        setShowFlagInput(false)
        // Refresh danh sách
        if (activeTab === 'conversations') {
          setConversations(prev => prev.map(c => c.id === selectedConv.id ? { ...c, flagged: nextFlag, flaggedReason: nextFlag ? flagReason : null } : c))
        } else if (activeTab === 'safety') {
          setSafetyLogs(prev => prev.map(c => c.id === selectedConv.id ? { ...c, flagged: nextFlag, flaggedReason: nextFlag ? flagReason : null } : c))
        }
        alert(nextFlag ? 'Đã gắn cờ cuộc hội thoại thành công!' : 'Đã gỡ cờ cuộc hội thoại.')
      }
    } catch {
      alert('Không thể thực hiện gắn cờ.')
    }
  }

  // Xuất file báo cáo kiểm toán hội thoại (Excel/CSV format)
  const handleExportAudit = (conv) => {
    const headers = [
      'ID Phiên',
      'Tiêu Đề',
      'Ngôn Ngữ',
      'Loại Người Dùng',
      'Mức Độ Nguy Cơ',
      'Thời Gian Phản Hồi (ms)',
      'Gắn Cờ Review',
      'Lý Do Gắn Cờ',
      'Thời Gian Khởi Tạo',
    ]
    const rows = [
      [
        conv.id,
        conv.title,
        conv.lang?.toUpperCase() || 'VI',
        conv.isGuest ? 'Guest (Vãng lai)' : 'Thành viên',
        conv.urgency?.toUpperCase() || 'NORMAL',
        conv.responseTimeMs || 'N/A',
        conv.flagged ? 'Có' : 'Không',
        conv.flaggedReason || '',
        new Date(conv.createdAt).toLocaleString('vi-VN'),
      ],
    ]
    exportToExcelCSV(`Bao_Cao_Kiem_Toan_${conv.id.slice(0, 8)}`, headers, rows)
  }

  // Quản lý người dùng
  const handleSaveUserEdit = async (userId) => {
    try {
      const res = await fetch(apiUrl(`/api/admin/users/${userId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: editPlan, role: editRole })
      })
      if (res.ok) {
        setEditingUserId(null)
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, planId: editPlan, role: editRole } : u))
        alert('Cập nhật quyền hạn thành viên thành công!')
      }
    } catch {
      alert('Lỗi cập nhật người dùng.')
    }
  }

  const handleDeleteUser = async (userId) => {
    if (!confirm('Xóa tài khoản này đồng thời sẽ xóa mọi phiên hội thoại liên quan. Bạn có chắc chắn?')) return
    try {
      const res = await fetch(apiUrl(`/api/admin/users/${userId}`), { method: 'DELETE' })
      if (res.ok) {
        setUsers(prev => prev.filter(u => u.id !== userId))
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleResetTokens = async (userId) => {
    if (!confirm('Đặt lại số token đã dùng về 0?')) return
    try {
      const res = await fetch(apiUrl(`/api/admin/users/${userId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetTokens: true })
      })
      if (res.ok) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, tokensUsed: 0 } : u))
      }
    } catch (err) {
      console.error(err)
    }
  }

  // ─── QUẢN LÝ PHẢN HỒI ──────────────────────────────────────────────────
  const handleViewFbDetails = (fb) => {
    const fbId = fb?.id || fb?._id
    if (!fbId) return
    const normalizedFb = { ...fb, id: fbId }
    setSelectedFb(normalizedFb)
    setFbReplyText(fb.adminReply || '')
    setFbNotesText(fb.adminNotes || '')
    setFbStatusUpdate(fb.status || 'new')
    setShowFbDetail(true)
  }

  const handleSaveFbUpdate = async () => {
    const fbId = selectedFb?.id || selectedFb?._id
    if (!fbId) return
    setFbSaving(true)
    try {
      const res = await fetch(apiUrl(`/api/admin/feedbacks/${fbId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: fbStatusUpdate,
          adminNotes: fbNotesText,
          adminReply: fbReplyText || null,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const updatedFb = data.feedback || { ...selectedFb, status: fbStatusUpdate, adminNotes: fbNotesText, adminReply: fbReplyText }
        setSelectedFb(updatedFb)
        setFeedbacks(prev => prev.map(f => (f.id === fbId || f._id === fbId) ? updatedFb : f))
        alert('Cập nhật phản hồi thành công!')
        setShowFbDetail(false)
      } else {
        const err = await res.json().catch(() => ({}))
        alert('Lỗi: ' + (err.error || 'Không thể cập nhật.'))
      }
    } catch {
      alert('Lỗi khi cập nhật phản hồi.')
    } finally {
      setFbSaving(false)
    }
  }

  const handleDeleteFb = async (targetId) => {
    if (!targetId) return
    if (!confirm('Xóa phản hồi này? Hành động không thể hoàn tác.')) return
    try {
      const res = await fetch(apiUrl(`/api/admin/feedbacks/${targetId}`), { method: 'DELETE' })
      if (res.ok) {
        setFeedbacks(prev => prev.filter(f => f.id !== targetId && f._id !== targetId))
        if (selectedFb?.id === targetId || selectedFb?._id === targetId) setShowFbDetail(false)
      }
    } catch (err) {
      console.error(err)
    }
  }

  // Xuất báo cáo hoạt động định kỳ (Tuần/Tháng) dạng tóm tắt
  const handleExportPeriodicReport = (type) => {
    const reportData = {
      reportType: type === 'week' ? 'Báo cáo Tuần' : 'Báo cáo Tháng',
      generatedAt: new Date().toLocaleString('vi-VN'),
      metrics: overviewStats ? {
        totalChats: overviewStats.chatCounts,
        activeUsers: overviewStats.activeUsers,
        emergencyRate: `${overviewStats.emergencyRate}%`,
        avgResponseTime: `${overviewStats.avgResponseTimeMs}ms`,
        topSymptoms: overviewStats.topSymptoms
      } : 'No data available'
    }
    downloadJsonFile(`MedChat247_Periodic_Report_${type}.json`, reportData)
  }

  return (
    <div className="admin-dashboard-root">
      {/* Sidebar Navigation */}
      <aside className="admin-side">
        <div className="admin-side__brand">
          <PulseIcon className="pulse-icon-blue" />
          <h2>MedChat247 Admin</h2>
        </div>

        <div className="admin-side__user">
          <span className="admin-avatar-initial">{account.name.charAt(0).toUpperCase()}</span>
          <div>
            <h4>{account.name}</h4>
            <p className="role-tag">Hệ thống Vận hành</p>
          </div>
        </div>

        <nav className="admin-side__nav">
          <button className={`admin-nav-item ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
            <GaugeIcon />
            <span>Tổng quan hệ thống</span>
          </button>
          <button className={`admin-nav-item ${activeTab === 'conversations' ? 'active' : ''}`} onClick={() => { setActiveTab('conversations'); setConvPage(1); }}>
            <UserCircleIcon />
            <span>Quản lý hội thoại</span>
          </button>
          <button className={`admin-nav-item ${activeTab === 'safety' ? 'active' : ''}`} onClick={() => setActiveTab('safety')}>
            <CheckIcon />
            <span>An toàn y tế</span>
          </button>
          <button className={`admin-nav-item ${activeTab === 'users' ? 'active' : ''}`} onClick={() => { setActiveTab('users'); setUserPage(1); }}>
            <UserCircleIcon />
            <span>Quản lý thành viên</span>
          </button>
          <button className={`admin-nav-item ${activeTab === 'payments' ? 'active' : ''}`} onClick={() => { setActiveTab('payments'); setPayPage(1); }}>
            <CreditCardIcon />
            <span>Thanh toán &amp; Doanh thu</span>
          </button>
          <button className={`admin-nav-item ${activeTab === 'feedbacks' ? 'active' : ''}`} onClick={() => { setActiveTab('feedbacks'); setFbPage(1); }}>
            <MessageSquareIcon />
            <span>Phản hồi</span>
          </button>
          <button className={`admin-nav-item ${activeTab === 'ops' ? 'active' : ''}`} onClick={() => setActiveTab('ops')}>
            <HelpCircleIcon />
            <span>Giám sát vận hành</span>
          </button>
        </nav>

        <footer className="admin-side__foot">
          <button className="btn-exit-admin" onClick={onBack} title="Quay lại màn hình chat">
            ← Quay lại ứng dụng
          </button>
          <button className="btn-exit-admin" onClick={onSignOut} style={{ borderColor: '#ef4444', color: '#ef4444' }}>
            Đăng xuất tài khoản
          </button>
        </footer>
      </aside>

      {/* Main Panel Content */}
      <main className="admin-main">

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && overviewStats && (
          <div className="tab-pane">
            <header className="pane-header">
              <div>
                <h1>Tổng Quan Vận Hành</h1>
                <p>Thống kê xu hướng triệu chứng và chất lượng tư vấn lâm sàng của Bot.</p>
              </div>
              <button className="btn-reload-dashboard" onClick={fetchAdminData} disabled={loading} title="Tải lại dữ liệu mới nhất">
                <RefreshIcon className={loading ? 'animate-spin' : ''} />
                <span>Làm mới dữ liệu</span>
              </button>
            </header>

            {/* Metrics cards */}
            <div className="overview-cards">
              <div className="overview-card">
                <span className="card-label">Hội thoại mới (Hôm nay/Tuần/Tháng)</span>
                <h2>{overviewStats.chatCounts.today} / {overviewStats.chatCounts.week} / {overviewStats.chatCounts.month}</h2>
                <div className="card-trend text-blue">Hoạt động ổn định</div>
              </div>
              <div className="overview-card">
                <span className="card-label">Doanh thu hệ thống</span>
                <h2 className="text-success-custom">{(overviewStats.totalRevenue || 0).toLocaleString('vi-VN')} đ</h2>
                <div className="card-trend text-success-custom">Thanh toán &amp; Auto-billing</div>
              </div>
              <div className="overview-card">
                <span className="card-label">Thành viên Premium (Pro)</span>
                <h2>{overviewStats.proUsersCount || 0}</h2>
                <div className="card-trend text-blue">Đăng ký trả phí hoạt động</div>
              </div>
              <div className="overview-card">
                <span className="card-label">Người dùng hoạt động (Tháng)</span>
                <h2>{overviewStats.activeUsers}</h2>
                <div className="card-trend text-blue">Thành viên và vãng lai</div>
              </div>
              <div className="overview-card">
                <span className="card-label">Tỷ lệ khẩn cấp (Cấp cứu)</span>
                <h2 className="text-danger-custom">{overviewStats.emergencyRate}%</h2>
                <div className="card-trend">Đề xuất đi cấp cứu</div>
              </div>
              <div className="overview-card">
                <span className="card-label">Phản hồi trung bình</span>
                <h2>{overviewStats.avgResponseTimeMs}ms</h2>
                <div className="card-trend text-success-custom">Tốc độ tối ưu</div>
              </div>
            </div>

            {/* Charts Section */}
            <div className="charts-grid mt-6">
              {/* Left Chart: Top Symptoms */}
              <div className="chart-box card-box">
                <h3>Triệu chứng y tế hỏi nhiều nhất (Top Symptoms)</h3>
                <p className="chart-subtitle">Tần suất xuất hiện triệu chứng được bot trích xuất từ hội thoại</p>
                <div className="symptoms-bar-chart mt-4">
                  {overviewStats.topSymptoms.length === 0 ? (
                    <p className="text-center-muted py-4" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', padding: '16px 0' }}>Chưa ghi nhận dữ liệu triệu chứng từ các phiên chat.</p>
                  ) : (
                    overviewStats.topSymptoms.map((symp, i) => {
                      const maxVal = Math.max(...overviewStats.topSymptoms.map(s => s.count)) || 1
                      const percent = Math.round((symp.count / maxVal) * 100)
                      return (
                        <div className="symptom-bar-row" key={i}>
                          <span className="symptom-name">{symp._id}</span>
                          <div className="bar-wrapper">
                            <div className="bar-fill" style={{ width: `${percent}%` }} />
                          </div>
                          <span className="symptom-val">{symp.count} lượt</span>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Right Chart: Urgency Donut Chart */}
              <div className="chart-box card-box">
                <h3>Phân bổ mức độ nguy cơ (Urgency Distribution)</h3>
                <p className="chart-subtitle">Phân loại khẩn cấp được xác định tự động qua chẩn đoán lâm sàng</p>
                
                <div className="donut-chart-container mt-4">
                  <svg viewBox="0 0 36 36" className="donut-svg">
                    <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="var(--bg-app)" strokeWidth="3" />
                    {/* SVG Donut logic segments */}
                    {(() => {
                      const total = overviewStats.urgencyDistribution.emergency + overviewStats.urgencyDistribution.warning + overviewStats.urgencyDistribution.normal
                      if (total === 0) return null
                      const ePct = (overviewStats.urgencyDistribution.emergency / total) * 100
                      const wPct = (overviewStats.urgencyDistribution.warning / total) * 100
                      const nPct = (overviewStats.urgencyDistribution.normal / total) * 100
                      
                      // Calculate offset strokes
                      const strokeE = `${ePct} ${100 - ePct}`
                      const strokeW = `${wPct} ${100 - wPct}`
                      const strokeN = `${nPct} ${100 - nPct}`
                      
                      return (
                        <>
                          <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#10b981" strokeWidth="3" strokeDasharray={strokeN} strokeDashoffset="0" />
                          <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#fbbf24" strokeWidth="3" strokeDasharray={strokeW} strokeDashoffset={-nPct} />
                          <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#ef4444" strokeWidth="3" strokeDasharray={strokeE} strokeDashoffset={-(nPct + wPct)} />
                        </>
                      )
                    })()}
                  </svg>
                  <div className="donut-labels">
                    <div className="donut-label-row"><span className="dot dot-green" /><span>Bình thường: {overviewStats.urgencyDistribution.normal}</span></div>
                    <div className="donut-label-row"><span className="dot dot-yellow" /><span>Cần theo dõi: {overviewStats.urgencyDistribution.warning}</span></div>
                    <div className="donut-label-row"><span className="dot dot-red" /><span>Khẩn cấp: {overviewStats.urgencyDistribution.emergency}</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Periodic reports generation */}
            <div className="card-box mt-6 block-reports">
              <h3>Báo cáo vận hành định kỳ</h3>
              <p className="chart-subtitle">Tải dữ liệu phân tích định kỳ cho tổ chuyên môn hoặc bộ phận Ops</p>
              <div className="flex-buttons mt-4">
                <button className="btn-report-dl blue" onClick={() => handleExportPeriodicReport('week')}>Xuất báo cáo tuần này (JSON)</button>
                <button className="btn-report-dl blue-soft" onClick={() => handleExportPeriodicReport('month')}>Xuất báo cáo tháng này (JSON)</button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CONVERSATIONS */}
        {activeTab === 'conversations' && (
          <div className="tab-pane">
            <header className="pane-header">
              <div>
                <h1>Quản Lý Lịch Sử Hội Thoại</h1>
                <p>Xem toàn bộ phiên tư vấn, lọc theo độ khẩn cấp, ngôn ngữ và xuất báo cáo audit.</p>
              </div>
              <button className="btn-reload-dashboard" onClick={fetchAdminData} disabled={loading} title="Tải lại dữ liệu mới nhất">
                <RefreshIcon className={loading ? 'animate-spin' : ''} />
                <span>Làm mới dữ liệu</span>
              </button>
            </header>

            {/* Search & Filters */}
            <div className="filters-bar card-box mb-4">
              <div className="search-input-wrapper">
                <SearchIcon />
                <input
                  type="text"
                  placeholder="Tìm kiếm tiêu đề cuộc hội thoại..."
                  value={searchConv}
                  onChange={e => { setSearchConv(e.target.value); setConvPage(1); }}
                />
              </div>

              <div className="filter-dropdowns">
                <select value={filterUrgency} onChange={e => { setFilterUrgency(e.target.value); setConvPage(1); }}>
                  <option value="">-- Mức nguy cơ --</option>
                  <option value="normal">Bình thường</option>
                  <option value="warning">Cần theo dõi</option>
                  <option value="emergency">Khẩn cấp</option>
                </select>

                <select value={filterLang} onChange={e => { setFilterLang(e.target.value); setConvPage(1); }}>
                  <option value="">-- Ngôn ngữ --</option>
                  <option value="vi">Tiếng Việt</option>
                  <option value="en">English</option>
                </select>

                <select value={filterGuest} onChange={e => { setFilterGuest(e.target.value); setConvPage(1); }}>
                  <option value="">-- Tài khoản --</option>
                  <option value="false">Đã đăng ký</option>
                  <option value="true">Khách vãng lai</option>
                </select>
              </div>
            </div>

            {/* Table conversations */}
            <div className="card-box">
              <div className="table-responsive">
                <table className="admin-table-custom">
                  <thead>
                    <tr>
                      <th>ID phiên</th>
                      <th>Cuộc hội thoại</th>
                      <th>Ngôn ngữ</th>
                      <th>Người dùng</th>
                      <th>Mức nguy cơ</th>
                      <th>Phản hồi</th>
                      <th>Trạng thái</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conversations.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="text-center-muted">Không tìm thấy phiên hội thoại phù hợp.</td>
                      </tr>
                    ) : (
                      conversations.map(c => (
                        <tr key={c.id}>
                          <td className="font-mono text-sm text-muted">{c.id.slice(0, 8)}...</td>
                          <td>
                            <strong>{c.title}</strong>
                            <br />
                            <span className="text-xs text-muted">{new Date(c.createdAt).toLocaleString('vi-VN')}</span>
                          </td>
                          <td className="uppercase text-xs font-semibold">{c.lang}</td>
                          <td>
                            {c.isGuest ? (
                              <span className="guest-pill">Guest (Vãng lai)</span>
                            ) : (
                              <span className="user-pill">Member</span>
                            )}
                          </td>
                          <td><UrgencyBadge urgency={c.urgency} /></td>
                          <td>{c.responseTimeMs ? `${c.responseTimeMs}ms` : 'N/A'}</td>
                          <td>
                            {c.flagged ? (
                              <span className="flagged-warn" title={c.flaggedReason}>🚩 Đã gắn cờ</span>
                            ) : (
                              <span className="text-xs text-muted">Bình thường</span>
                            )}
                          </td>
                          <td>
                            <div className="actions-cell">
                              <button className="btn-table-action blue" onClick={() => handleViewDetails(c.id)}>Chi tiết</button>
                              <button className="btn-table-action gray" onClick={() => handleExportAudit(c)} title="Xuất JSON kiểm toán">Xuất File</button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalConvPages > 1 && (
                <div className="pagination-bar mt-4">
                  <button disabled={convPage === 1} onClick={() => setConvPage((p) => p - 1)}>
                    <ChevronLeftIcon /> <span>Trước</span>
                  </button>
                  <span>Trang {convPage} / {totalConvPages}</span>
                  <button disabled={convPage === totalConvPages} onClick={() => setConvPage((p) => p + 1)}>
                    <span>Sau</span> <ChevronRightIcon />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: MEDICAL SAFETY (AN TOÀN Y TẾ) */}
        {activeTab === 'safety' && (
          <div className="tab-pane">
            <header className="pane-header">
              <div>
                <h1>Giám Sát An Toàn Y Tế</h1>
                <p>Danh sách các trường hợp bot đưa ra cảnh báo khẩn cấp (cấp cứu) hoặc bị gắn cờ review.</p>
              </div>
              <button className="btn-reload-dashboard" onClick={fetchAdminData} disabled={loading} title="Tải lại dữ liệu mới nhất">
                <RefreshIcon className={loading ? 'animate-spin' : ''} />
                <span>Làm mới dữ liệu</span>
              </button>
            </header>

            <div className="card-box">
              <div className="table-responsive">
                <table className="admin-table-custom">
                  <thead>
                    <tr>
                      <th>ID Phiên</th>
                      <th>Nội dung tư vấn</th>
                      <th>Ngày kích hoạt</th>
                      <th>Nguy cơ</th>
                      <th>Lý do gắn cờ</th>
                      <th>Xem lại</th>
                    </tr>
                  </thead>
                  <tbody>
                    {safetyLogs.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="text-center-muted">Không có trường hợp khẩn cấp hoặc gắn cờ nào cần review.</td>
                      </tr>
                    ) : (
                      safetyLogs.map(log => (
                        <tr key={log.id} className={log.urgency === 'emergency' ? 'row-emergency-light' : ''}>
                          <td className="font-mono text-sm">{log.id.slice(0, 8)}...</td>
                          <td>
                            <strong>{log.title}</strong>
                            <p className="text-xs text-muted limit-chars">{log.messages[0]?.content.slice(0, 80)}...</p>
                          </td>
                          <td>{new Date(log.createdAt).toLocaleString('vi-VN')}</td>
                          <td><UrgencyBadge urgency={log.urgency} /></td>
                          <td>
                            {log.flagged ? (
                              <span className="text-danger font-semibold">{log.flaggedReason}</span>
                            ) : (
                              <span className="text-muted text-xs">Cảnh báo tự động</span>
                            )}
                          </td>
                          <td>
                            <button className="btn-table-action blue" onClick={() => handleViewDetails(log.id)}>Xem &amp; Phân tích</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: USERS (QUẢN LÝ THÀNH VIÊN) */}
        {activeTab === 'users' && (
          <div className="tab-pane">
            <header className="pane-header">
              <div>
                <h1>Quản Lý Thành Viên</h1>
                <p>Danh sách người dùng hệ thống, phân quyền và điều chỉnh hạn mức Token.</p>
              </div>
              <button className="btn-reload-dashboard" onClick={fetchAdminData} disabled={loading} title="Tải lại dữ liệu mới nhất">
                <RefreshIcon className={loading ? 'animate-spin' : ''} />
                <span>Làm mới dữ liệu</span>
              </button>
            </header>

            <div className="filters-bar card-box mb-4">
              <div className="search-input-wrapper w-full">
                <SearchIcon />
                <input
                  type="text"
                  placeholder="Tìm kiếm thành viên theo email hoặc tên..."
                  value={searchUser}
                  onChange={e => { setSearchUser(e.target.value); setUserPage(1); }}
                />
              </div>
            </div>

            <div className="card-box">
              <div className="table-responsive">
                <table className="admin-table-custom">
                  <thead>
                    <tr>
                      <th>Tên thành viên</th>
                      <th>Email</th>
                      <th>Gói cước</th>
                      <th>Quyền hạn</th>
                      <th>Token đã dùng</th>
                      <th>Ngày tham gia</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id}>
                        <td><strong>{u.name}</strong></td>
                        <td>{u.email}</td>
                        <td>
                          {editingUserId === u.id ? (
                            <select value={editPlan} onChange={e => setEditPlan(e.target.value)} className="select-table-edit">
                              <option value="free">Free</option>
                              <option value="pro">Pro</option>
                            </select>
                          ) : (
                            <span className={`plan-pill plan-${u.planId}`}>{u.planId}</span>
                          )}
                        </td>
                        <td>
                          {editingUserId === u.id ? (
                            <select value={editRole} onChange={e => setEditRole(e.target.value)} className="select-table-edit">
                              <option value="user">User</option>
                              <option value="admin">Admin</option>
                            </select>
                          ) : (
                            <span className="font-semibold text-xs uppercase">{u.role}</span>
                          )}
                        </td>
                        <td className="font-mono text-sm">{u.tokensUsed?.toLocaleString('vi-VN') || 0}</td>
                        <td>{new Date(u.createdAt).toLocaleDateString('vi-VN')}</td>
                        <td>
                          <div className="actions-cell">
                            {editingUserId === u.id ? (
                              <>
                                <button className="btn-table-action green" onClick={() => handleSaveUserEdit(u.id)}>Lưu</button>
                                <button className="btn-table-action gray" onClick={() => setEditingUserId(null)}>Hủy</button>
                              </>
                            ) : (
                              <>
                                <button className="btn-table-action blue" onClick={() => {
                                  setEditingUserId(u.id)
                                  setEditPlan(u.planId)
                                  setEditRole(u.role)
                                }}>Sửa</button>
                                <button className="btn-table-action blue-soft" onClick={() => handleResetTokens(u.id)}>Reset Token</button>
                                <button className="btn-table-action danger" onClick={() => handleDeleteUser(u.id)}>Xóa</button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalUserPages > 1 && (
                <div className="pagination-bar mt-4">
                  <button disabled={userPage === 1} onClick={() => setUserPage((p) => p - 1)}>
                    <ChevronLeftIcon /> <span>Trước</span>
                  </button>
                  <span>Trang {userPage} / {totalUserPages}</span>
                  <button disabled={userPage === totalUserPages} onClick={() => setUserPage((p) => p + 1)}>
                    <span>Sau</span> <ChevronRightIcon />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: OPS & PERFORMANCE */}
        {activeTab === 'ops' && opsLogs && (
          <div className="tab-pane">
            <header className="pane-header">
              <div>
                <h1>Giám Sát Vận Hành &amp; Chi Phí</h1>
                <p>Theo dõi chi phí gọi API LLM và nhật ký lỗi kỹ thuật trên toàn hệ thống.</p>
              </div>
              <button className="btn-reload-dashboard" onClick={fetchAdminData} disabled={loading} title="Tải lại dữ liệu mới nhất">
                <RefreshIcon className={loading ? 'animate-spin' : ''} />
                <span>Làm mới dữ liệu</span>
              </button>
            </header>

            {/* Overview stats for ops */}
            <div className="overview-cards">
              <div className="overview-card">
                <span className="card-label">Uptime Bot</span>
                <h2 className="text-success-custom">{opsLogs.uptime}</h2>
                <div className="card-trend text-success-custom">Vận hành liên tục</div>
              </div>
              <div className="overview-card">
                <span className="card-label">Tần suất lỗi hệ thống (Tháng)</span>
                <h2 className={opsLogs.errors.length > 0 ? 'text-danger-custom' : 'text-success-custom'}>
                  {opsLogs.errors.length} lỗi
                </h2>
                <div className="card-trend">Lỗi mạng &amp; timeout API</div>
              </div>
            </div>

            {/* Modern Redesigned Cost & Tokens Chart */}
            <div className="card-box mt-6">
              {(() => {
                const totalTokensPeriod = opsLogs.costs.reduce((acc, x) => acc + (x.totalTokens || 0), 0)
                const totalCostPeriod = opsLogs.costs.reduce((acc, x) => acc + (x.totalCost || 0), 0)
                return (
                  <>
                    <div className="ops-chart-header">
                      <div>
                        <h3>Thống kê chi phí API LLM &amp; Tokens tích lũy</h3>
                        <p className="chart-subtitle">Ghi nhận mức độ tiêu thụ của mô hình AI theo thời gian</p>
                      </div>
                      <div className="ops-summary-badges">
                        <div className="ops-badge ops-badge--tokens">
                          <span className="ops-badge-label">Tổng Tokens</span>
                          <span className="ops-badge-val">⚡ {totalTokensPeriod.toLocaleString('vi-VN')}</span>
                        </div>
                        <div className="ops-badge ops-badge--cost">
                          <span className="ops-badge-label">Ước tính chi phí</span>
                          <span className="ops-badge-val">💵 ${totalCostPeriod < 0.01 ? totalCostPeriod.toFixed(4) : totalCostPeriod.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="modern-cost-chart-container mt-4">
                      {opsLogs.costs.map((c, idx) => {
                        const maxTokens = Math.max(...opsLogs.costs.map(x => x.totalTokens || 1)) || 10000
                        const heightPercent = Math.max(15, Math.round(((c.totalTokens || 0) / maxTokens) * 100))
                        const tokenFormatted = (c.totalTokens || 0) >= 1000 
                          ? `${((c.totalTokens || 0) / 1000).toFixed(1)}k` 
                          : `${c.totalTokens || 0}`
                        
                        return (
                          <div className="modern-chart-col" key={idx}>
                            <div className="modern-bar-top-badge">
                              <span className="token-pill">{tokenFormatted}</span>
                            </div>
                            <div className="modern-bar-track">
                              <div 
                                className="modern-bar-fill" 
                                style={{ height: `${heightPercent}%` }} 
                                title={`Ngày ${c._id}: ${(c.totalTokens || 0).toLocaleString('vi-VN')} tokens | $${(c.totalCost || 0).toFixed(4)}`} 
                              />
                            </div>
                            <div className="modern-bar-labels">
                              <span className="bar-date-label">{c._id.slice(-5).replace('-', '/')}</span>
                              <span className="bar-cost-badge">
                                {c.totalCost > 0 && c.totalCost < 0.01 ? `$${c.totalCost.toFixed(4)}` : `$${c.totalCost.toFixed(2)}`}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )
              })()}
            </div>

            {/* Errors logs list */}
            <div className="card-box mt-6">
              <h3>Nhật ký lỗi hệ thống gần nhất</h3>
              <p className="chart-subtitle">Tự động phát hiện lỗi ngắt quãng hoặc lỗi gọi API LLM/UMLS</p>
              
              <div className="table-responsive mt-4">
                <table className="admin-table-custom">
                  <thead>
                    <tr>
                      <th>Thời gian</th>
                      <th>Lỗi xảy ra</th>
                      <th>Môi trường/Meta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opsLogs.errors.length === 0 ? (
                      <tr>
                        <td colSpan="3" className="text-center-muted">Hệ thống ghi nhận không có lỗi nào xảy ra gần đây.</td>
                      </tr>
                    ) : (
                      opsLogs.errors.map(err => (
                        <tr key={err.id}>
                          <td>{new Date(err.createdAt).toLocaleString('vi-VN')}</td>
                          <td>
                            <strong className="text-danger-custom">{err.message}</strong>
                            <p className="text-xs text-muted font-mono whitespace-pre-wrap mt-1">{err.meta?.error}</p>
                          </td>
                          <td>
                            <span className="text-xs font-semibold">Specialty: {err.meta?.specialtyId}</span>
                            <br />
                            <span className="text-xs text-muted">User: {err.meta?.userId}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: PAYMENTS & REVENUE (THANH TOÁN & DOANH THU) */}
        {activeTab === 'payments' && (
          <div className="tab-pane">
            <header className="pane-header">
              <div>
                <h1>Quản Lý Giao Dịch &amp; Doanh Thu</h1>
                <p>Danh sách toàn bộ các hóa đơn nâng cấp và gia hạn định kỳ (Auto-billing) trên hệ thống.</p>
              </div>
              <button className="btn-reload-dashboard" onClick={fetchAdminData} disabled={loading} title="Tải lại dữ liệu mới nhất">
                <RefreshIcon className={loading ? 'animate-spin' : ''} />
                <span>Làm mới dữ liệu</span>
              </button>
            </header>

            {/* Filters bar */}
            <div className="filters-bar card-box mb-4">
              <div className="filter-title">
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 650 }}>Bộ lọc giao dịch</h3>
              </div>
              <div className="filter-dropdowns">
                <select value={filterPayStatus} onChange={e => { setFilterPayStatus(e.target.value); setPayPage(1); }}>
                  <option value="">-- Trạng thái --</option>
                  <option value="success">Thành công</option>
                  <option value="failed">Thất bại</option>
                  <option value="pending">Chờ thanh toán</option>
                </select>

                <select value={filterPayGateway} onChange={e => { setFilterPayGateway(e.target.value); setPayPage(1); }}>
                  <option value="">-- Cổng thanh toán --</option>
                  <option value="paypal">PayPal Checkout</option>
                </select>
              </div>
            </div>

            {/* Transaction log table */}
            <div className="card-box">
              <div className="table-responsive">
                <table className="admin-table-custom">
                  <thead>
                    <tr>
                      <th>Mã hóa đơn</th>
                      <th>Khách hàng</th>
                      <th>Gói cước</th>
                      <th>Cổng thanh toán</th>
                      <th>Loại</th>
                      <th>Số tiền</th>
                      <th>Thời gian</th>
                      <th>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="text-center-muted">Không tìm thấy giao dịch nào.</td>
                      </tr>
                    ) : (
                      payments.map(p => (
                        <tr key={p.id}>
                          <td className="font-mono text-sm">{p.id.slice(0, 10)}...</td>
                          <td>
                            <strong>{p.user?.name || 'Người dùng'}</strong>
                            <br />
                            <span className="text-xs text-muted">{p.user?.email || 'N/A'}</span>
                          </td>
                          <td><span className="plan-pill plan-pro">{p.planId}</span></td>
                          <td>
                            <span className={`gateway-pill gateway-${p.paymentGateway}`}>
                              {p.paymentGateway === 'paypal' ? '💳 PayPal' : (p.paymentGateway || 'PayPal')}
                            </span>
                          </td>
                          <td>
                            {p.type === 'recurring' ? (
                              <span className="type-badge-recurring">Gia hạn tự động</span>
                            ) : (
                              <span className="type-badge-initial">Nâng cấp lần đầu</span>
                            )}
                          </td>
                          <td className="font-bold text-success-custom">
                            {(p.amount || 0).toLocaleString('vi-VN')} đ
                          </td>
                          <td>{new Date(p.createdAt).toLocaleString('vi-VN')}</td>
                          <td>
                            {p.status === 'success' && <span className="badge-status badge-success">Thành công</span>}
                            {p.status === 'failed' && <span className="badge-status badge-failed">Thất bại</span>}
                            {p.status === 'pending' && <span className="badge-status badge-pending">Chờ xử lý</span>}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPayPages > 1 && (
                <div className="pagination-bar mt-4">
                  <button disabled={payPage === 1} onClick={() => setPayPage((p) => p - 1)}>
                    <ChevronLeftIcon /> <span>Trước</span>
                  </button>
                  <span>Trang {payPage} / {totalPayPages}</span>
                  <button disabled={payPage === totalPayPages} onClick={() => setPayPage((p) => p + 1)}>
                    <span>Sau</span> <ChevronRightIcon />
                  </button>
                </div>
              )}
            </div>

            {/* Export payments report */}
            <div className="card-box mt-6 block-reports">
              <h3>Xuất báo cáo tài chính</h3>
              <p className="chart-subtitle">Tải toàn bộ lịch sử hóa đơn để phục vụ báo cáo kế toán và đối soát.</p>
              <div className="flex-buttons mt-4">
                <button
                  className="btn-report-dl blue"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                  onClick={() => {
                    const headers = [
                      'Mã Hóa Đơn',
                      'Khách Hàng (Tên)',
                      'Email',
                      'Gói Cước',
                      'Cổng Thanh Toán',
                      'Loại Giao Dịch',
                      'Số Tiền (VNĐ)',
                      'Thời Gian Giao Dịch',
                      'Trạng Thái',
                    ]
                    const rows = payments.map((p) => [
                      p.id,
                      p.user?.name || 'Người dùng',
                      p.user?.email || 'N/A',
                      p.planId === 'pro' ? 'Gói Pro Y Tế' : p.planId,
                      p.paymentGateway === 'paypal' ? 'PayPal' : p.paymentGateway,
                      p.type === 'recurring' ? 'Gia hạn tự động' : 'Nâng cấp lần đầu',
                      p.amount || 0,
                      new Date(p.createdAt).toLocaleString('vi-VN'),
                      p.status === 'success' ? 'Thành công' : (p.status === 'failed' ? 'Thất bại' : 'Chờ xử lý'),
                    ])
                    exportToExcelCSV(`Bao_Cao_Giao_Dich_Tai_Chinh_MedChat247`, headers, rows)
                  }}
                >
                  <FileSpreadsheetIcon /> Xuất báo cáo giao dịch Excel (.xlsx / .csv)
                </button>
              </div>
            </div>
          </div>
        )}
        {/* TAB 7: PHẢN HỒI / GÓP Ý */}
        {activeTab === 'feedbacks' && (
          <div className="tab-pane">
            <header className="pane-header">
              <div>
                <h1>Quản Lý Phản Hồi &amp; Góp Ý</h1>
                <p>Xem và xử lý các góp ý, báo lỗi, yêu cầu trợ giúp từ người dùng.</p>
              </div>
              <button className="btn-reload-dashboard" onClick={fetchAdminData} disabled={loading} title="Tải lại dữ liệu">
                <RefreshIcon className={loading ? 'animate-spin' : ''} />
                <span>Làm mới</span>
              </button>
            </header>

            {/* Filter bar */}
            <div className="filters-bar card-box mb-4">
              <div className="search-input-wrapper">
                <SearchIcon />
                <input
                  type="text"
                  placeholder="Tìm kiếm tên, email, nội dung..."
                  value={searchFb}
                  onChange={e => { setSearchFb(e.target.value); setFbPage(1); }}
                />
              </div>
              <div className="filter-dropdowns">
                <select value={filterFbCategory} onChange={e => { setFilterFbCategory(e.target.value); setFbPage(1); }}>
                  <option value="">-- Loại --</option>
                  <option value="help">Trợ giúp</option>
                  <option value="bug">Báo lỗi</option>
                  <option value="feature">Tính năng</option>
                  <option value="question">Câu hỏi</option>
                  <option value="complaint">Khiếu nại</option>
                  <option value="other">Khác</option>
                </select>
                <select value={filterFbStatus} onChange={e => { setFilterFbStatus(e.target.value); setFbPage(1); }}>
                  <option value="">-- Trạng thái --</option>
                  <option value="new">Mới</option>
                  <option value="read">Đã đọc</option>
                  <option value="in_progress">Đang xử lý</option>
                  <option value="resolved">Đã giải quyết</option>
                  <option value="closed">Đã đóng</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="card-box">
              <div className="table-responsive">
                <table className="admin-table-custom">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Người gửi</th>
                      <th>Loại</th>
                      <th>Ưu tiên</th>
                      <th>Trạng thái</th>
                      <th>Nội dung</th>
                      <th>Ngày gửi</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feedbacks.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="text-center-muted">Không có phản hồi nào.</td>
                      </tr>
                    ) : (
                      feedbacks.map(fb => (
                        <tr key={fb.id} className={fb.status === 'new' ? 'row-new-feedback' : ''}>
                          <td className="font-mono text-sm text-muted">{(fb.id || '').slice(0, 10)}...</td>
                          <td>
                            <strong>{fb.isAnonymous ? 'Khách ẩn danh' : (fb.user?.name || fb.userName)}</strong>
                            <br />
                            <span className="text-xs text-muted">{fb.isAnonymous ? '—' : (fb.user?.email || fb.userEmail || '—')}</span>
                          </td>
                          <td>
                            <span className={`category-badge category-${fb.category}`}>
                              {fb.category === 'help' ? 'Trợ giúp' :
                               fb.category === 'bug' ? 'Báo lỗi' :
                               fb.category === 'feature' ? 'Tính năng' :
                               fb.category === 'question' ? 'Câu hỏi' :
                               fb.category === 'complaint' ? 'Khiếu nại' : 'Khác'}
                            </span>
                          </td>
                          <td>
                            <span className={`priority-badge priority-${fb.priority}`}>
                              {fb.priority === 'urgent' ? 'Khẩn cấp' :
                               fb.priority === 'high' ? 'Cao' :
                               fb.priority === 'medium' ? 'TB' : 'Thấp'}
                            </span>
                          </td>
                          <td>
                            <span className={`status-badge status-${fb.status}`}>
                              {fb.status === 'new' ? 'Mới' :
                               fb.status === 'read' ? 'Đã đọc' :
                               fb.status === 'in_progress' ? 'Xử lý' :
                               fb.status === 'resolved' ? 'Xong' : 'Đóng'}
                            </span>
                          </td>
                          <td className="limit-chars" style={{ maxWidth: '200px' }}>
                            <span className="text-sm">{(fb.content || '').slice(0, 60)}{(fb.content || '').length > 60 ? '...' : ''}</span>
                          </td>
                          <td className="text-xs text-muted">
                            {fb.createdAt ? new Date(fb.createdAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>
                          <td>
                            <div className="actions-cell">
                              <button className="btn-table-action blue" onClick={() => handleViewFbDetails(fb)}>Xem &amp; Xử lý</button>
                              <button className="btn-table-action danger" onClick={() => handleDeleteFb(fb.id || fb._id)}>Xóa</button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalFbPages > 1 && (
                <div className="pagination-bar mt-4">
                  <button disabled={fbPage === 1} onClick={() => setFbPage(p => p - 1)}>
                    <ChevronLeftIcon /> <span>Trước</span>
                  </button>
                  <span>Trang {fbPage} / {totalFbPages}</span>
                  <button disabled={fbPage === totalFbPages} onClick={() => setFbPage(p => p + 1)}>
                    <span>Sau</span> <ChevronRightIcon />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* MODAL CHI TIẾT PHẢN HỒI */}
      {showFbDetail && (
        <FeedbackDetailModal
          feedback={selectedFb}
          statusUpdate={fbStatusUpdate}
          onStatusUpdateChange={setFbStatusUpdate}
          notesText={fbNotesText}
          onNotesTextChange={setFbNotesText}
          replyText={fbReplyText}
          onReplyTextChange={setFbReplyText}
          saving={fbSaving}
          onSave={handleSaveFbUpdate}
          onClose={() => setShowFbDetail(false)}
        />
      )}

      {/* MODAL XEM CHI TIẾT HỘI THOẠI & AUDIT */}
      {showDetailModal && (
        <ConversationDetailModal
          conversation={selectedConv}
          flagReason={flagReason}
          onFlagReasonChange={setFlagReason}
          showFlagInput={showFlagInput}
          onShowFlagInputChange={setShowFlagInput}
          onToggleFlag={handleToggleFlag}
          onExportAudit={handleExportAudit}
          onClose={() => setShowDetailModal(false)}
        />
      )}
    </div>
  )
}
