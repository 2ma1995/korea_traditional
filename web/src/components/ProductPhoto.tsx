import Image from 'next/image';

export default function ProductPhoto({ productNo, name, priority = false, className = '' }: { productNo: number; name: string; priority?: boolean; className?: string }) {
  return <Image src={`/images/product-${productNo}.png`} alt={name} width={1000} height={1000} sizes="(max-width: 640px) 100vw, (max-width: 1000px) 50vw, 600px" preload={priority} className={`product-photo ${className}`} />;
}
