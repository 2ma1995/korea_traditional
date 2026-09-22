import type { Metadata } from "next";
import { SHOP_BASE } from '@/lib/shop';
import { Geist, Geist_Mono, Noto_Serif_KR } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 한국 전통 느낌의 제목용 명조체.
// CJK 폰트는 파일이 커서 preload를 끄고 필요할 때 받는다.
const notoSerifKR = Noto_Serif_KR({
  variable: "--font-serif-kr",
  weight: ["400", "600", "700"],
  subsets: ["latin"],
  preload: false,
  display: "swap",
});

export const metadata: Metadata = {
  title: "막지 빵장 · MAKJI Bread Market",
  description: "장이 끝나면 빵장이 열립니다. 시장이 크게 움직인 날, 빵을 살 수 있는 가격도 크게 움직입니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} ${notoSerifKR.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        {children}
        <footer className="site-footer">
          <div className="footer-top"><Link href="/" className="wordmark">막지<small>MAKJI</small></Link><p>계절이 건네는 맛, 막지가 담습니다.</p><a href={SHOP_BASE} target="_blank" rel="noopener noreferrer">막지 공식몰 ↗</a></div>
          <div className="footer-bottom"><span>© {new Date().getFullYear()} MAKJI. All rights reserved.</span><span>한국의 계절을 한 입에 담다.</span></div>
        </footer>
      </body>
    </html>
  );
}
