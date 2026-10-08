import { tr } from '../../lib/i18n'
import { categories, formatMoney } from '../../lib/finance'
import { Icon } from '../../components/Icon'

const circumference = 2 * Math.PI * 82

export function SpendingChart({
  items,
  totalCents,
}: {
  items: { category: string; amountCents: number }[]
  totalCents: number
}) {
  if (!items.length || totalCents === 0) {
    return (
      <div className="empty-state compact">
        <Icon name="leaf" size={30} />
        <p>{tr("这个月还没有支出记录")}</p>
        <span>{tr("添加消费后，在这里查看分类。")}</span>
      </div>
    )
  }

  const slices = items.map((item, index) => {
    const category = categories.find((value) => value.id === item.category)
    const fraction = item.amountCents / totalCents
    return {
      ...item,
      label: category?.label ?? item.category,
      color: category?.color ?? '#7c8e84',
      percentage: `${(fraction * 100).toFixed(1)}%`,
      length: fraction * circumference,
      offset: items.slice(0, index).reduce((sum, value) => sum + value.amountCents, 0)
        / totalCents * circumference,
    }
  })

  return (
    <div className="spending-chart">
      <div className="spending-donut">
        <svg viewBox="0 0 220 220" role="img" aria-label={tr("当月支出分类占比环形图")}>
          {slices.map((slice) => (
            <circle
              key={slice.category}
              cx="110"
              cy="110"
              r="82"
              fill="none"
              stroke={slice.color}
              strokeWidth="26"
              strokeDasharray={`${slice.length} ${circumference - slice.length}`}
              strokeDashoffset={-slice.offset}
              transform="rotate(-90 110 110)"
            >
              <title>{`${slice.label}：${formatMoney(slice.amountCents)}（${slice.percentage}）`}</title>
            </circle>
          ))}
        </svg>
        <div className="spending-donut-total">
          <span>{tr("当月总支出")}</span>
          <strong>{formatMoney(totalCents)}</strong>
          <small>{items.length}{tr(" 个分类")}</small>
        </div>
      </div>
      <ul className="spending-legend" aria-label={tr("支出分类金额与占比")}>
        {slices.map((slice) => (
          <li key={slice.category}>
            <span className="spending-category">
              <i style={{ background: slice.color }} />
              {slice.label}
            </span>
            <strong>{formatMoney(slice.amountCents)}</strong>
            <span className="spending-percentage">{slice.percentage}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
