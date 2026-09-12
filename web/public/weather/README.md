# 날씨 아이콘

Meteocons — https://meteocons.com/ (Bas Milius)
MIT License. 원문은 `LICENSE.txt`에 함께 둔다.

`@bybas/weather-icons`의 `production/fill/all/`에서 필요한 15개만 복사했다.
패키지 전체는 4.4MB에 아이콘이 122개라 의존성으로 두지 않았다.

애니메이션이 SVG 안에 SMIL로 들어있어 `<img>`로 불러도 그대로 움직인다.
아이콘을 추가하려면:

    npm install --no-save @bybas/weather-icons
    cp node_modules/@bybas/weather-icons/production/fill/all/<이름>.svg public/weather/
    npm uninstall @bybas/weather-icons

WMO 날씨 코드 → 파일 매핑은 `src/components/WeatherTile.tsx`에 있다.
