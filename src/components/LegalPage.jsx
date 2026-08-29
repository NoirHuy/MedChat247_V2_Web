import { useState } from 'react'
import {
  PulseIcon,
  AlertIcon,
  ShieldCheckIcon,
  LockIcon,
  ArrowLeftIcon,
  FileTextIcon,
  UserCircleIcon,
  CreditCardIcon,
  CheckIcon,
} from './Icons'
import './LegalPage.css'

const legalData = {
  privacy: {
    title: {
      vi: 'Chính sách bảo mật dữ liệu y tế',
      en: 'Medical Data Privacy Policy',
    },
    subtitle: {
      vi: 'Quy định chi tiết về cách MedChat247 thu thập, bảo vệ và quản lý thông tin sức khỏe cá nhân của bạn.',
      en: 'Comprehensive standards on how MedChat247 collects, protects, and manages your personal health data.',
    },
    updatedAt: '08/08/2026',
    sections: [
      {
        id: 'collection',
        icon: FileTextIcon,
        heading: { vi: '1. Dữ liệu chúng tôi thu thập', en: '1. Data We Collect' },
        body: {
          vi: 'MedChat247 chỉ thu thập các thông tin tối thiểu cần thiết để vận hành dịch vụ: (a) Thông tin tài khoản cá nhân như họ tên, địa chỉ email, ảnh đại diện và phương thức đăng nhập; (b) Lịch sử hội thoại tư vấn y tế và các triệu chứng sức khỏe do bạn chủ động nhập vào; (c) Thông tin kỹ thuật thiết bị và nhật ký kết nối (IP, loại trình duyệt) để đảm bảo an toàn hệ thống.',
          en: 'MedChat247 collects only the minimum necessary information required to operate the service: (a) Personal account details such as full name, email address, profile picture, and login provider; (b) Medical consultation chat history and health symptoms voluntarily entered by you; (c) Technical device information and connection logs (IP address, browser type) to ensure system security.',
        },
      },
      {
        id: 'medical-confidentiality',
        icon: ShieldCheckIcon,
        heading: { vi: '2. Bảo mật & Cam kết Dữ liệu Y tế', en: '2. Medical Data Confidentiality & Commitment' },
        body: {
          vi: 'Dữ liệu y tế và triệu chứng của bạn được coi là thông tin bảo mật tuyệt đối. MedChat247 cam kết KHÔNG BÁN, KHÔNG CHO THUÊ và KHÔNG CHIA SẺ dữ liệu sức khỏe cá nhân của bạn cho bất kỳ bên thứ ba nào vì mục đích quảng cáo hoặc tiếp thị. Dữ liệu trò chuyện chỉ được sử dụng để xử lý câu hỏi AI và tối ưu hóa trải nghiệm tư vấn cho chính bạn.',
          en: 'Your medical data and symptoms are treated as strictly confidential information. MedChat247 pledges NOT TO SELL, RENT, or SHARE your personal health data with any third party for advertising or marketing purposes. Chat data is strictly utilized to process AI queries and optimize your personalized consultation experience.',
        },
      },
      {
        id: 'security',
        icon: LockIcon,
        heading: { vi: '3. Kiểm soát An toàn & Mã hóa', en: '3. Security Controls & Encryption' },
        body: {
          vi: 'Chúng tôi áp dụng các tiêu chuẩn an ninh mạng hiện đại: Mã hóa đường truyền SSL/TLS 256-bit cho toàn bộ dữ liệu di chuyển; Mật khẩu tài khoản được băm mã hóa một chiều bằng thuật toán bcrypt cao cấp; Cơ sở dữ liệu lưu trữ được bảo vệ bởi các lớp tường lửa và cơ chế kiểm soát truy cập nghiêm ngặt.',
          en: 'We implement state-of-the-art cybersecurity standards: 256-bit SSL/TLS transport encryption for all data in transit; Account passwords hashed using industry-standard bcrypt algorithm; Encrypted databases protected behind multi-layered firewalls and strict access controls.',
        },
      },
      {
        id: 'user-rights',
        icon: UserCircleIcon,
        heading: { vi: '4. Quyền kiểm soát Dữ liệu của Người dùng', en: '4. User Data Control & Rights' },
        body: {
          vi: 'Bạn có toàn quyền kiểm soát dữ liệu cá nhân của mình: Bạn có thể xem, chỉnh sửa thông tin hồ sơ, xuất lịch sử trò chuyện hoặc yêu cầu XÓA TÀI KHOẢN VĨNH VIỄN cùng toàn bộ dữ liệu hội thoại liên quan bất kỳ lúc nào trực tiếp trong phần Cài đặt tài khoản.',
          en: 'You maintain full authority over your personal data: You can view, update profile information, export chat history, or request PERMANENT ACCOUNT DELETION along with all associated conversation logs at any time directly in Account Settings.',
        },
      },
      {
        id: 'payment',
        icon: CreditCardIcon,
        heading: { vi: '5. Bảo mật Giao dịch Thanh toán', en: '5. Payment Transaction Security' },
        body: {
          vi: 'Mọi giao dịch nâng cấp gói cước Pro đều được xử lý trực tiếp thông qua đối tác cổng thanh toán quốc tế PayPal đạt chứng nhận PCI-DSS. MedChat247 không trực tiếp lưu trữ mã số thẻ tín dụng hay mật khẩu tài khoản ngân hàng của bạn.',
          en: 'All Pro plan transactions are processed directly through PCI-DSS certified international payment gateway partners (PayPal). MedChat247 does not directly store your credit card numbers or banking credentials.',
        },
      },
    ],
  },
  terms: {
    title: {
      vi: 'Điều khoản sử dụng dịch vụ',
      en: 'Terms of Service',
    },
    subtitle: {
      vi: 'Các quy định và thỏa thuận pháp lý khi bạn truy cập và sử dụng hệ thống MedChat247.',
      en: 'Rules and legal agreements governing your access and use of MedChat247.',
    },
    updatedAt: '08/08/2026',
    sections: [
      {
        id: 'disclaimer',
        icon: AlertIcon,
        heading: { vi: '1. Tuyên bố Miễn trừ Trách nhiệm Y tế (Quan trọng)', en: '1. Medical Disclaimer (Critical)' },
        body: {
          vi: 'MedChat247 là công cụ trí tuệ nhân tạo hỗ trợ tham khảo và sàng lọc thông tin y tế ban đầu. NỘI DUNG DO MEDCHAT247 CUNG CẤP KHÔNG PHẢI LÀ CHẨN ĐOÁN Y KHOA CHÍNH THỨC, KHÔNG THAY THẾ ĐƠN THUỐC HAY LỜI KHUYÊN TRỰC TIẾP TỪ BÁC SĨ CHUYÊN KHOA. Người dùng không nên tự ý dùng thuốc hoặc dừng điều trị y tế chỉ dựa trên thông tin từ ứng dụng.',
          en: 'MedChat247 is an artificial intelligence tool designed for medical information reference and preliminary symptom screening. CONTENT PROVIDED BY MEDCHAT247 DOES NOT CONSTITUTE OFFICIAL MEDICAL DIAGNOSIS, PRESCRIPTIONS, OR DIRECT PHYSICIAN ADVICE. Users must not self-medicate or alter medical treatments solely based on AI responses.',
        },
      },
      {
        id: 'emergency',
        icon: AlertIcon,
        heading: { vi: '2. Quy định trong Trường hợp Khẩn cấp', en: '2. Emergency Situations Protocol' },
        body: {
          vi: 'DỊCH VỤ NÀY KHÔNG DÙNG CHO CÁC TÌNH HUỐNG CẤP CỨU Y TẾ ĐE DỌA TÍNH MẠNG. Nếu bạn hoặc ai đó đang gặp các triệu chứng cấp tính nghiêm trọng (đau ngực dữ dội, khó thở cấp, tai nạn nặng, đột quỵ, ngất xỉu), HÃY GỌI NGAY CHO TỔNG ĐÀI CẤP CỨU 115 hoặc di chuyển tức thì đến Bệnh viện/Cơ sở y tế gần nhất.',
          en: 'THIS SERVICE IS NOT DESIGNED FOR LIFE-THREATENING MEDICAL EMERGENCIES. If you or someone else experiences severe acute symptoms (chest pain, acute shortness of breath, severe trauma, stroke, fainting), IMMEDIATELY CALL EMERGENCY SERVICES (115) or proceed to the nearest hospital emergency room.',
        },
      },
      {
        id: 'account-responsibility',
        icon: UserCircleIcon,
        heading: { vi: '3. Trách nhiệm Tài khoản Người dùng', en: '3. User Account Responsibilities' },
        body: {
          vi: 'Bạn có trách nhiệm bảo vệ bí mật thông tin đăng nhập của mình. Không chia sẻ tài khoản cho người khác sử dụng chung hoặc thực hiện các hành vi truy cập trái phép, phát tán mã độc, phá hoại hạ tầng mạng của MedChat247.',
          en: 'You are responsible for maintaining the confidentiality of your account credentials. You must not share your account with third parties or engage in unauthorized access, malware distribution, or infrastructure disruption.',
        },
      },
      {
        id: 'pro-subscription',
        icon: CreditCardIcon,
        heading: { vi: '4. Gói thuê bao Pro & Điều khoản Thanh toán', en: '4. Pro Plan & Payment Terms' },
        body: {
          vi: 'Gói Pro được kích hoạt tự động ngay khi cổng thanh toán PayPal xác nhận giao dịch thành công. Bạn có thể sử dụng các tính năng nâng cao không giới hạn theo thời hạn đăng ký. Các yêu cầu hoàn tiền sẽ được xem xét xử lý theo chính sách bảo vệ người mua của PayPal và quy định pháp luật hiện hành.',
          en: 'The Pro plan activates automatically upon confirmed payment processing by PayPal. You gain unlimited access to advanced features for your subscription duration. Refund requests are evaluated pursuant to PayPal buyer protection policies and applicable regulations.',
        },
      },
      {
        id: 'intellectual-property',
        icon: ShieldCheckIcon,
        heading: { vi: '5. Quyền sở hữu Trí tuệ', en: '5. Intellectual Property Rights' },
        body: {
          vi: 'Toàn bộ thương hiệu MedChat247, logo, giao diện người dùng, thuật toán mô hình trí tuệ nhân tạo và cơ sở dữ liệu y tế thuộc quyền sở hữu độc quyền của MedChat247. Mọi hành vi sao chép, giả mạo hoặc thương mại hóa khi chưa có sự đồng ý bằng văn bản đều là vi phạm pháp luật.',
          en: 'All MedChat247 trademarks, logos, user interfaces, AI algorithms, and medical knowledge bases remain the exclusive property of MedChat247. Unauthorized duplication, imitation, or commercial exploitation without written consent is strictly prohibited.',
        },
      },
    ],
  },
}

export default function LegalPage({ type = 'privacy' }) {
  const [activeType, setActiveType] = useState(type)
  const [lang, setLang] = useState(localStorage.getItem('medai_lang') || 'vi')
  const isEn = lang === 'en'

  const content = legalData[activeType] ?? legalData.privacy

  function toggleLang() {
    const nextLang = lang === 'en' ? 'vi' : 'en'
    setLang(nextLang)
    localStorage.setItem('medai_lang', nextLang)
  }

  function handleTabChange(newType) {
    setActiveType(newType)
    window.history.pushState({}, '', newType === 'terms' ? '/terms' : '/privacy-policy')
  }

  return (
    <div className="legal-shell">
      {/* Navigation Bar */}
      <header className="legal-nav">
        <div className="legal-nav__inner">
          <a href="/" className="legal-nav__brand">
            <PulseIcon className="legal-nav__logo" />
            <span>MedChat247</span>
          </a>

          <div className="legal-nav__right">
            <button className="legal-lang-btn" onClick={toggleLang}>
              {isEn ? 'Vietnamese' : 'English'}
            </button>
            <a href="/" className="legal-nav__back-btn">
              <ArrowLeftIcon />
              <span>{isEn ? 'Back to App' : 'Quay lại ứng dụng'}</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="legal-container">
        {/* Document Header & Tabs */}
        <div className="legal-header">
          <div className="legal-header__badge">
            <ShieldCheckIcon />
            <span>{isEn ? 'Official Legal Documentation' : 'Văn bản Pháp lý Chính thức'}</span>
          </div>

          <h1 className="legal-header__title">{content.title[lang]}</h1>
          <p className="legal-header__subtitle">{content.subtitle[lang]}</p>
          <p className="legal-header__date">
            {isEn ? 'Last updated: ' : 'Cập nhật lần cuối: '}
            <strong>{content.updatedAt}</strong>
          </p>

          {/* Tab Switcher */}
          <div className="legal-tabs">
            <button
              className={`legal-tab ${activeType === 'privacy' ? 'legal-tab--active' : ''}`}
              onClick={() => handleTabChange('privacy')}
            >
              <LockIcon />
              <span>{isEn ? 'Privacy Policy' : 'Chính sách bảo mật'}</span>
            </button>
            <button
              className={`legal-tab ${activeType === 'terms' ? 'legal-tab--active' : ''}`}
              onClick={() => handleTabChange('terms')}
            >
              <FileTextIcon />
              <span>{isEn ? 'Terms of Service' : 'Điều khoản sử dụng'}</span>
            </button>
          </div>
        </div>

        {/* Emergency Alert Box for Terms */}
        {activeType === 'terms' && (
          <div className="legal-callout legal-callout--danger">
            <div className="legal-callout__icon">
              <AlertIcon />
            </div>
            <div className="legal-callout__content">
              <h4>{isEn ? 'Medical Emergency Notice' : 'Thông báo Cấp cứu Y tế Khẩn cấp'}</h4>
              <p>
                {isEn
                  ? 'MedChat247 is not an emergency response system. If you believe you are experiencing a life-threatening medical emergency, call 115 or go to the nearest emergency room immediately.'
                  : 'MedChat247 không phải là hệ thống tiếp nhận cấp cứu. Nếu bạn tin rằng mình đang gặp tình huống y tế nguy cấp đe dọa tính mạng, hãy gọi ngay 115 hoặc di chuyển đến cơ sở cấp cứu gần nhất.'}
              </p>
            </div>
          </div>
        )}

        {/* Privacy Commitment Box */}
        {activeType === 'privacy' && (
          <div className="legal-callout legal-callout--success">
            <div className="legal-callout__icon">
              <ShieldCheckIcon />
            </div>
            <div className="legal-callout__content">
              <h4>{isEn ? 'Zero Data-Selling Pledge' : 'Cam kết Bảo vệ Quyền riêng tư Y tế'}</h4>
              <p>
                {isEn
                  ? 'Your medical queries are encrypted and strictly confidential. We never sell, rent, or monetize your health information with third parties.'
                  : 'Các triệu chứng và thông tin y tế của bạn được mã hóa an toàn và bảo mật tuyệt đối. Chúng tôi không bao giờ bán hay thương mại hóa dữ liệu sức khỏe của bạn.'}
              </p>
            </div>
          </div>
        )}

        {/* Content Layout with Table of Contents Sidebar */}
        <div className="legal-layout">
          <aside className="legal-toc">
            <p className="legal-toc__title">{isEn ? 'Table of Contents' : 'Mục lục nội dung'}</p>
            <nav className="legal-toc__nav">
              {content.sections.map((sec) => (
                <a key={sec.id} href={`#${sec.id}`} className="legal-toc__link">
                  <CheckIcon className="legal-toc__check" />
                  <span>{sec.heading[lang]}</span>
                </a>
              ))}
            </nav>
          </aside>

          <article className="legal-body">
            {content.sections.map((sec) => {
              const IconComp = sec.icon
              return (
                <section key={sec.id} id={sec.id} className="legal-section">
                  <div className="legal-section__header">
                    <div className="legal-section__icon-box">
                      <IconComp />
                    </div>
                    <h2>{sec.heading[lang]}</h2>
                  </div>
                  <p className="legal-section__text">{sec.body[lang]}</p>
                </section>
              )
            })}
          </article>
        </div>

        {/* Footer */}
        <footer className="legal-footer">
          <p className="legal-footer__copy">
            © {new Date().getFullYear()} <strong>MedChat247</strong>. {isEn ? 'All rights reserved.' : 'Tất cả các quyền được bảo lưu.'}
          </p>
          <div className="legal-footer__links">
            <a href="/">{isEn ? 'Home' : 'Trang chủ MedChat247'}</a>
            <span className="legal-footer__dot">•</span>
            <a href="/privacy-policy">{isEn ? 'Privacy Policy' : 'Chính sách bảo mật'}</a>
            <span className="legal-footer__dot">•</span>
            <a href="/terms">{isEn ? 'Terms of Service' : 'Điều khoản sử dụng'}</a>
          </div>
        </footer>
      </main>
    </div>
  )
}
