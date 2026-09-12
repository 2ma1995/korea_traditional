import { useId } from 'react';
import styles from './SeasonJourney.module.css';

/** Small botanical paintings drawn in the calendar's own 600 × 600 coordinate space. */
export default function SeasonIngredientArt({ season }: { season: number }) {
  const id = useId();
  const paint = (name: string) => `url(#${id}-${name})`;

  return (
    <svg className={styles.calendarArt} viewBox="0 0 600 600" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <filter id={`${id}-paper`} x="-12%" y="-12%" width="124%" height="124%">
          <feTurbulence type="fractalNoise" baseFrequency=".055" numOctaves="3" seed="8" result="grain" />
          <feDisplacementMap in="SourceGraphic" in2="grain" scale="1.8" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <linearGradient id={`${id}-leaf`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#b5bb86" stopOpacity=".8" />
          <stop offset=".52" stopColor="#758759" stopOpacity=".85" />
          <stop offset="1" stopColor="#425d43" />
        </linearGradient>
        <radialGradient id={`${id}-peach`} cx=".3" cy=".32" r=".8">
          <stop stopColor="#f3d5aa" />
          <stop offset=".5" stopColor="#e8ae91" />
          <stop offset="1" stopColor="#bd6b62" />
        </radialGradient>
        <linearGradient id={`${id}-chestnut`} x1="0" y1="0" x2=".8" y2="1">
          <stop stopColor="#bc8353" />
          <stop offset=".48" stopColor="#8d4e30" />
          <stop offset="1" stopColor="#583927" />
        </linearGradient>
        <linearGradient id={`${id}-bean`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#b77869" />
          <stop offset=".55" stopColor="#914e46" />
          <stop offset="1" stopColor="#613b39" />
        </linearGradient>
        <path id={`${id}-mugwort`} d="M0 0 C-5-8-17-7-21-16 L-11-17-27-28-15-29-23-42-11-39-13-55-4-49 0-68 6-51 15-57 12-39 25-45 18-28 29-30 16-15 22-12 C13-5 5-8 0 0Z" />
        <path id={`${id}-adzuki`} d="M-13-3 C-14-14 0-19 10-12 19-6 17 7 8 13-3 20-17 10-13-3Z" />
      </defs>

      <g className={styles.ingredientPainting} data-active={season === 0} data-ingredient="쑥">
        <g filter={paint('paper')}>
          <path d="M156 402C140 360 179 314 213 307 233 341 221 397 184 416Z" fill="#94a278" opacity=".09" />
          <path d="M164 407C180 373 194 341 210 305M185 357 164 333M196 332 219 313" stroke="#63734f" strokeWidth="2.2" strokeLinecap="round" />
          <g fill={paint('leaf')}>
            <use href={`#${id}-mugwort`} transform="translate(180 376) rotate(-60) scale(.76)" />
            <use href={`#${id}-mugwort`} transform="translate(185 364) rotate(57) scale(.78)" />
            <use href={`#${id}-mugwort`} transform="translate(193 344) rotate(-49) scale(.7)" />
            <use href={`#${id}-mugwort`} transform="translate(200 330) rotate(50) scale(.64)" />
            <use href={`#${id}-mugwort`} transform="translate(207 314) rotate(12) scale(.63)" />
          </g>
          <path d="M178 374 153 356M188 360 215 342M192 343 170 319M201 329 222 308M208 311 214 278" stroke="#e3e5c9" strokeOpacity=".55" strokeWidth="1" />
          <g transform="translate(402 209) rotate(32)">
            <use href={`#${id}-mugwort`} fill={paint('leaf')} transform="scale(.62)" opacity=".7" />
            <path d="M0 8V-32" stroke="#6e7c54" strokeWidth="1.2" />
          </g>
        </g>
      </g>

      <g className={styles.ingredientPainting} data-active={season === 1} data-ingredient="복숭아">
        <g filter={paint('paper')}>
          <path d="M354 224C350 199 383 169 421 179 456 190 464 232 441 255 416 275 365 257 354 224Z" fill="#e7ba9a" opacity=".07" />
          <path d="M396 194C387 175 372 171 361 173 373 183 382 191 396 194Z" fill={paint('leaf')} />
          <path d="M399 195C411 171 432 165 451 170 438 187 421 196 399 195Z" fill={paint('leaf')} />
          <path d="M402 194 436 175" stroke="#c7cc98" strokeWidth="1" strokeOpacity=".65" />
          <path d="M394 198C385 187 368 190 360 203 344 226 367 252 394 260 417 255 440 239 436 217 433 195 411 185 394 198Z" fill={paint('peach')} />
          <path d="M394 198C401 214 386 235 394 255" stroke="#a86558" strokeWidth="1.3" strokeOpacity=".55" />
          <path d="M362 219C359 228 369 241 380 245" stroke="#fae3bd" strokeWidth="5" strokeLinecap="round" opacity=".3" />
          <path d="M395 198 399 184" stroke="#8c7953" strokeWidth="2.5" strokeLinecap="round" />
          <g transform="translate(174 353) rotate(-18) scale(.68)">
            <path d="M0-29C-27-44-46-12-29 12-17 28-3 33 0 35 24 29 44 7 35-15 29-31 14-39 0-29Z" fill={paint('peach')} />
            <path d="M0-29C9-12-7 10 0 31" stroke="#a86558" strokeWidth="1.4" strokeOpacity=".55" />
            <path d="M2-29C6-53 30-57 45-52 32-35 20-28 2-29Z" fill={paint('leaf')} />
          </g>
        </g>
      </g>

      <g className={styles.ingredientPainting} data-active={season === 2} data-ingredient="밤">
        <g filter={paint('paper')}>
          <path d="M137 369C142 337 174 320 210 331 245 343 253 382 220 402 188 422 143 400 137 369Z" fill="#ebc48f" opacity=".09" />
          <path d="M178 353C167 337 161 316 168 298L178 308 179 303 188 321 184 344 199 331 218 334 213 341 225 344C211 359 194 364 178 353Z" fill="#c3a16c" opacity=".85" />
          <path d="M177 319 183 350 211 342" stroke="#74573b" strokeWidth="1.2" strokeOpacity=".7" />
          <g transform="translate(174 375) rotate(-16)">
            <path d="M0-37C-8-25-33-17-33 7-33 28 23 31 32 11 39-7 11-29 0-37Z" fill={paint('chestnut')} />
            <path d="M-31 12C-14 4 15 6 31 13 21 32-25 29-31 12Z" fill="#d9b88b" />
            <path d="M-19-5C-17-14-9-19-4-22" stroke="#e5ba87" strokeWidth="3" strokeLinecap="round" opacity=".35" />
            <path d="M-22 18 19 19M-14 23 12 23" stroke="#997751" strokeWidth="1" strokeDasharray="1 4" opacity=".6" />
          </g>
          <g transform="translate(223 369) rotate(19) scale(.8)">
            <path d="M0-37C-8-25-33-17-33 7-33 28 23 31 32 11 39-7 11-29 0-37Z" fill={paint('chestnut')} />
            <path d="M-31 12C-14 4 15 6 31 13 21 32-25 29-31 12Z" fill="#d9b88b" />
            <path d="M-19-5C-17-14-9-19-4-22" stroke="#e5ba87" strokeWidth="3" strokeLinecap="round" opacity=".3" />
          </g>
          <path d="M375 189C396 167 422 172 443 192L432 195 438 201 424 203 428 210 410 207 410 215C393 212 382 203 375 189Z" fill="#d7b276" opacity=".85" />
          <path d="M367 185 427 199M397 193 407 182M410 196 420 208" stroke="#78593b" strokeWidth="1.2" strokeOpacity=".6" />
        </g>
      </g>

      <g className={styles.ingredientPainting} data-active={season === 3} data-ingredient="팥">
        <g filter={paint('paper')}>
          <path d="M155 347C168 327 222 337 233 370 240 395 207 413 178 399 153 388 142 369 155 347Z" fill="#d4aaa0" opacity=".07" />
          <path d="M383 169C405 186 429 200 435 224 427 238 399 222 390 208 381 194 377 180 383 169Z" fill="#c6b18b" />
          <path d="M383 169C388 190 410 218 435 224" stroke="#826e57" strokeWidth="1.5" />
          <path d="M387 179C399 195 414 204 427 218" stroke="#e9d8b2" strokeWidth="3" strokeLinecap="round" opacity=".7" />
          <g fill={paint('bean')}>
            <use href={`#${id}-adzuki`} transform="translate(182 355) rotate(-28)" />
            <use href={`#${id}-adzuki`} transform="translate(210 365) rotate(35) scale(.95)" />
            <use href={`#${id}-adzuki`} transform="translate(174 385) rotate(48) scale(.9)" />
            <use href={`#${id}-adzuki`} transform="translate(206 396) rotate(-52) scale(.8)" />
            <use href={`#${id}-adzuki`} transform="translate(145 369) rotate(-18) scale(.65)" />
            <use href={`#${id}-adzuki`} transform="translate(412 239) rotate(24) scale(.73)" />
            <use href={`#${id}-adzuki`} transform="translate(436 249) rotate(-40) scale(.58)" />
          </g>
          <g stroke="#e8d6bb" strokeWidth="2.5" strokeLinecap="round" opacity=".9">
            <path d="M178 350 182 357M211 360 207 367M177 381 171 386M204 392 209 396M143 366 145 371M412 235 410 241M434 247 437 250" />
          </g>
        </g>
      </g>
    </svg>
  );
}
