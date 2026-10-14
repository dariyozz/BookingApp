import { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom'
import { Check, ChevronRight, Clock3, Coffee, MapPin, Sparkles, X } from 'lucide-react'
import { formatInTimeZone } from 'date-fns-tz'
import { Button } from './components/ui/button'
import { Badge } from './components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card'
import { Input } from './components/ui/input'
import { Label } from './components/ui/label'
import { Dialog, DialogContent, DialogTrigger } from './components/ui/dialog'
import { cn } from './lib/utils'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001/api'
const TZ_LABEL = 'Europe/Skopje (Skopje time)'

type Slot = {
  id: string
  startAt: string
  endAt: string
  durationMinutes: number
  status: 'AVAILABLE' | 'BOOKED' | 'CANCELLED'
}

type Booking = {
  id: string
  slotId: string
  visitorName: string
  visitorEmail: string
  note?: string
  status: 'CONFIRMED' | 'CANCELLED'
  createdAt: string
}

type DashboardSummary = {
  totalSlots: number
  upcomingSlots: number
  availableSlots: number
  upcomingBookings: number
  cancelledBookings: number
}

type BookingConfirmation = {
  slot: Slot
  confirmationMessage: string
}

type ConfirmationToast = {
  slot: Slot
  message: string
  source: 'pending' | 'fallback' | 'gemini'
}

function formatDateTime(value: string, pattern: string) {
  return formatInTimeZone(new Date(value), 'Europe/Skopje', pattern)
}

function formatTimeRange(startAt: string, endAt: string) {
  return `${formatDateTime(startAt, 'HH:mm')}–${formatDateTime(endAt, 'HH:mm')}`
}

function errorMessage(error: unknown) {
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return 'The API cannot be reached. Start the backend and configure DATABASE_URL in server/.env.';
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-stone-50 text-stone-900">
        <header className="border-b border-stone-200 bg-[#f7f4ee]">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
            <Link to="/" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-700 text-sm font-semibold text-white">
                TL
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-stone-500">TeamLift</div>
                <div className="text-lg font-semibold text-stone-900">Coffee chats</div>
              </div>
            </Link>
            <nav className="flex items-center gap-2 text-sm font-medium">
              <NavLink to="/" className={({ isActive }) => cn('rounded-full px-3 py-2', isActive ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-200')}>
                Public booking
              </NavLink>
              <NavLink to="/dashboard" className={({ isActive }) => cn('rounded-full px-3 py-2', isActive ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-200')}>
                Dashboard
              </NavLink>
            </nav>
          </div>
        </header>

        <Routes>
          <Route path="/" element={<PublicBookingPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

function PublicBookingPage() {
  const [slots, setSlots] = useState<Slot[]>([])
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [isBookingOpen, setIsBookingOpen] = useState(false)
  const [confirmationToast, setConfirmationToast] = useState<ConfirmationToast | null>(null)
  const [form, setForm] = useState({ name: '', email: '', note: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [availabilityError, setAvailabilityError] = useState('')

  useEffect(() => {
    if (!confirmationToast || confirmationToast.source === 'pending') return
    const timeout = window.setTimeout(() => setConfirmationToast(null), 8000)
    return () => window.clearTimeout(timeout)
  }, [confirmationToast])

  const activeDate = useMemo(() => {
    const dates = Array.from(new Set(slots.map((slot) => formatDateTime(slot.startAt, 'yyyy-MM-dd')))).sort()
    if (!selectedDate && dates.length > 0) return dates[0]
    return selectedDate || ''
  }, [selectedDate, slots])

  useEffect(() => {
    fetch(`${API_BASE}/public/slots`)
      .then((response) => {
        if (!response.ok) throw new Error(`Availability could not be loaded (HTTP ${response.status}).`)
        return response.json()
      })
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('Availability response was not a list of slots.')
        setSlots(data)
        if (data.length > 0) setSelectedDate((current) => current || formatDateTime(data[0].startAt, 'yyyy-MM-dd'))
      })
      .catch((loadError: Error) => {
        setSlots([])
        setAvailabilityError(errorMessage(loadError) || 'Availability could not be loaded. Please try again later.')
      })
  }, [])

  const availableDates = useMemo(
    () => Array.from(new Set(slots.map((slot) => formatDateTime(slot.startAt, 'yyyy-MM-dd')))).sort(),
    [slots],
  )

  const visibleSlots = slots.filter((slot) => formatDateTime(slot.startAt, 'yyyy-MM-dd') === activeDate)

  const openBooking = (slot: Slot) => {
    setSelectedSlot(slot)
    setIsBookingOpen(true)
  }

  const handleBooking = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedSlot) return
    setIsSubmitting(true)
    setError('')

    try {
      const response = await fetch(`${API_BASE}/public/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotId: selectedSlot.id,
          visitorName: form.name,
          visitorEmail: form.email,
          note: form.note,
        }),
      })

      const payload = (await response.json()) as BookingConfirmation & { message?: string }
      if (!response.ok) {
        throw new Error(payload.message ?? 'Unable to complete the booking.')
      }

      setConfirmationToast({
        slot: payload.slot,
        message: payload.confirmationMessage,
        source: 'pending',
      })
      setIsBookingOpen(false)
      setForm({ name: '', email: '', note: '' })
      fetch(`${API_BASE}/public/slots`)
        .then((res) => res.json())
        .then((data) => setSlots(data))
        .catch(() => null)

      try {
        const aiResponse = await fetch(`${API_BASE}/ai/confirmation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slotId: selectedSlot.id,
            firstName: form.name.split(' ')[0] || 'friend',
          }),
        })
        if (!aiResponse.ok) throw new Error(`Confirmation message request failed (HTTP ${aiResponse.status}).`)
        const aiPayload = (await aiResponse.json()) as {
          message?: unknown
          source?: unknown
        }
        const message = aiPayload.message
        const source = aiPayload.source
        if (
          typeof message === 'string' &&
          message.trim() &&
          (source === 'gemini' || source === 'fallback')
        ) {
          setConfirmationToast((current) =>
            current
              ? {
                  ...current,
                  message,
                  source,
                }
              : current,
          )
        }
      } catch {
        setConfirmationToast((current) =>
          current ? { ...current, source: 'fallback' } : current,
        )
      }
    } catch (err: unknown) {
      setError(errorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-[32px] border border-stone-200 bg-[#f8f5ef] p-6 shadow-sm sm:p-8 lg:p-10">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-6">
            <Badge className="bg-emerald-100 text-emerald-900">Warm conversations, thoughtfully planned</Badge>
            <div className="space-y-4">
              <h1 className="text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">Book a relaxed coffee chat with Dario.</h1>
              <p className="max-w-xl text-base leading-7 text-stone-700">
                A thoughtful space to talk product, technology, and creative work—without the formal meeting setup.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-stone-700">
              <span className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-2"><Coffee className="h-4 w-4 text-emerald-700" /> Virtual coffee chat</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-2"><MapPin className="h-4 w-4 text-emerald-700" /> {TZ_LABEL}</span>
            </div>
          </div>

          <div className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#dfe8e2] text-base font-semibold text-emerald-900">DJ</div>
              <div>
                <div className="text-xl font-semibold text-stone-900">Dario Jakovleski</div>
                <div className="text-sm text-stone-600">Host • Virtual coffee chat</div>
              </div>
            </div>
            <p className="text-sm leading-6 text-stone-700">
              “I enjoy meeting curious people, sharing ideas, and talking about technology, products, and creative work. Book a relaxed chat and let’s connect.”
            </p>
          </div>
        </div>
      </section>

      {availabilityError ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {availabilityError}
        </p>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr]">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming availability</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {availableDates.length === 0 ? (
              <p className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-4 text-sm text-stone-500">No upcoming slots are available right now. Please check back soon.</p>
            ) : (
              availableDates.map((date) => (
                <button
                  key={date}
                  type="button"
                  onClick={() => setSelectedDate(date)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-xl border p-3 text-left transition',
                    activeDate === date ? 'border-emerald-700 bg-emerald-50' : 'border-stone-200 bg-white hover:bg-stone-50',
                  )}
                >
                  <div>
                    <div className="text-sm font-medium text-stone-900">{formatDateTime(`${date}T12:00:00`, 'EEE, d MMM')}</div>
                    <div className="text-xs text-stone-500">{slots.filter((slot) => formatDateTime(slot.startAt, 'yyyy-MM-dd') === date).length} slots open</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-stone-500" />
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Calendar and availability</CardTitle>
            <Badge className="bg-stone-100 text-stone-700">{TZ_LABEL}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-7 gap-2 text-center text-xs font-medium uppercase tracking-wide text-stone-500">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                <div key={day}>{day}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 35 }, (_, index) => {
                const cellDate = new Date();
                cellDate.setHours(0, 0, 0, 0)
                cellDate.setDate(cellDate.getDate() + index)
                const dateKey = formatDateTime(cellDate.toISOString(), 'yyyy-MM-dd')
                const matches = slots.filter((slot) => formatDateTime(slot.startAt, 'yyyy-MM-dd') === dateKey)
                const isSelected = dateKey === activeDate
                return (
                  <button
                    key={dateKey}
                    type="button"
                    onClick={() => setSelectedDate(dateKey)}
                    className={cn(
                      'flex h-16 flex-col justify-between rounded-xl border p-2 text-left transition',
                      isSelected ? 'border-emerald-700 bg-emerald-50' : 'border-stone-200 bg-white hover:border-stone-300',
                      matches.length === 0 ? 'opacity-50' : '',
                    )}
                  >
                    <div className="text-[11px] text-stone-500">{formatDateTime(cellDate.toISOString(), 'd')}</div>
                    <div className="text-[10px] text-stone-700">{matches.length} open</div>
                  </button>
                )
              })}
            </div>

            <div className="space-y-3 pt-2">
              {visibleSlots.length === 0 ? (
                <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-4 text-sm text-stone-500">
                  No open slots for this day. Try another date.
                </div>
              ) : (
                visibleSlots.map((slot) => (
                  <div key={slot.id} className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-lg font-semibold text-stone-900">{formatDateTime(slot.startAt, 'EEE, d MMM')}</div>
                      <div className="mt-1 flex items-center gap-3 text-sm text-stone-600">
                        <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> {formatTimeRange(slot.startAt, slot.endAt)}</span>
                        <span>• {slot.durationMinutes} min</span>
                      </div>
                    </div>
                    <Button onClick={() => openBooking(slot)}>Book this slot</Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      {confirmationToast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 sm:inset-x-auto sm:right-4 sm:justify-end sm:px-0">
          <section
            role="status"
            aria-live="polite"
            className={cn(
              'pointer-events-auto w-full max-w-md rounded-2xl border p-4 shadow-xl',
              confirmationToast.source === 'gemini'
                ? 'border-violet-200 bg-violet-50 text-violet-950'
                : 'border-emerald-200 bg-emerald-50 text-emerald-950',
            )}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                  confirmationToast.source === 'gemini'
                    ? 'bg-violet-100 text-violet-700'
                    : 'bg-emerald-100 text-emerald-700',
                )}
              >
                {confirmationToast.source === 'gemini' ? (
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Check className="h-4 w-4" aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">Booking confirmed</h2>
                  <Badge
                    className={
                      confirmationToast.source === 'gemini'
                        ? 'border-violet-200 bg-violet-100 text-violet-800'
                        : 'border-emerald-200 bg-white text-emerald-800'
                    }
                  >
                    {confirmationToast.source === 'gemini'
                      ? 'Gemini generated'
                      : confirmationToast.source === 'pending'
                        ? 'Personalizing…'
                        : 'Confirmation'}
                  </Badge>
                </div>
                <p className="mt-1 text-sm leading-5">{confirmationToast.message}</p>
                <p className="mt-2 text-xs opacity-75">
                  {formatDateTime(confirmationToast.slot.startAt, 'EEE, d MMM')} ·{' '}
                  {formatTimeRange(confirmationToast.slot.startAt, confirmationToast.slot.endAt)} {TZ_LABEL}
                </p>
              </div>
              <button
                type="button"
                aria-label="Dismiss booking confirmation"
                onClick={() => setConfirmationToast(null)}
                className="rounded-md p-1 opacity-70 transition hover:bg-black/5 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <Dialog open={isBookingOpen} onOpenChange={setIsBookingOpen}>
        <DialogTrigger asChild>
          <span className="sr-only" aria-hidden="true">Book slot</span>
        </DialogTrigger>
        <DialogContent>
          <div className="space-y-4">
            <div>
              <div className="text-xl font-semibold text-stone-900">Reserve your slot</div>
              <p className="mt-1 text-sm text-stone-600">Please share a few details before confirming.</p>
            </div>

            {selectedSlot ? (
              <div className="rounded-xl bg-stone-50 p-3 text-sm text-stone-700">
                <div className="font-medium text-stone-900">Selected slot</div>
                <div>{formatDateTime(selectedSlot.startAt, 'EEEE, d MMMM yyyy')}</div>
                <div>{formatTimeRange(selectedSlot.startAt, selectedSlot.endAt)} • {selectedSlot.durationMinutes} minutes • {TZ_LABEL}</div>
              </div>
            ) : null}

            <form onSubmit={handleBooking} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Your name" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input id="email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="note">Note (optional)</Label>
                <Input id="note" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="What would you like to talk about?" />
              </div>

              {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => setIsBookingOpen(false)}>Cancel</Button>
                <Button type="submit" className="flex-1" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Confirm booking'}</Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  )
}

function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary>({ totalSlots: 0, upcomingSlots: 0, availableSlots: 0, upcomingBookings: 0, cancelledBookings: 0 })
  const [slots, setSlots] = useState<Slot[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [form, setForm] = useState({ date: '', time: '09:00', duration: '45' })
  const [isBusy, setIsBusy] = useState(false)
  const [dashboardError, setDashboardError] = useState('')

  const loadDashboard = async () => {
    try {
      const response = await fetch(`${API_BASE}/dashboard`)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.message ?? 'Dashboard data could not be loaded.')
      if (!payload?.summary || !Array.isArray(payload.slots) || !Array.isArray(payload.bookings)) {
        throw new Error('The dashboard returned an invalid response.')
      }
      setSummary(payload.summary)
      setSlots(payload.slots)
      setBookings(payload.bookings)
      setDashboardError('')
    } catch (error) {
      setDashboardError(errorMessage(error))
      throw error
    }
  }

  useEffect(() => {
    void loadDashboard().catch(() => undefined)
  }, [])

  const submitSlot = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsBusy(true)
    try {
      const response = await fetch(`${API_BASE}/host/slots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: form.date,
          startTime: form.time,
          durationMinutes: Number(form.duration),
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.message ?? 'The slot could not be created.')
      setForm({ date: '', time: '09:00', duration: '45' })
      await loadDashboard()
    } catch (error) {
      setDashboardError(errorMessage(error))
    } finally {
      setIsBusy(false)
    }
  }

  const cancelSlot = async (slotId: string) => {
    try {
      const response = await fetch(`${API_BASE}/host/slots/${slotId}`, { method: 'DELETE' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.message ?? 'The slot could not be cancelled.')
      await loadDashboard()
    } catch (error) {
      setDashboardError(errorMessage(error))
    }
  }

  const cancelBooking = async (bookingId: string) => {
    try {
      const response = await fetch(`${API_BASE}/host/bookings/${bookingId}`, { method: 'DELETE' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.message ?? 'The booking could not be cancelled.')
      await loadDashboard()
    } catch (error) {
      setDashboardError(errorMessage(error))
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <div className="rounded-[28px] border border-stone-200 bg-[#f8f5ef] p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm uppercase tracking-[0.2em] text-stone-500">Host dashboard</div>
            <h2 className="mt-2 text-3xl font-semibold text-stone-900">TeamLift scheduling overview</h2>
          </div>
          <Badge className="bg-amber-100 text-amber-900">Unprotected demo dashboard</Badge>
        </div>
      </div>

      {dashboardError ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          Dashboard unavailable: {dashboardError}
        </p>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Upcoming slots', value: summary.upcomingSlots },
          { label: 'Available slots', value: summary.availableSlots },
          { label: 'Upcoming bookings', value: summary.upcomingBookings },
          { label: 'Cancelled records', value: summary.cancelledBookings },
        ].map((card) => (
          <Card key={card.label}>
            <CardContent className="p-5">
              <div className="text-sm text-stone-500">{card.label}</div>
              <div className="mt-3 text-3xl font-semibold text-stone-900">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Create a new slot</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitSlot} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="slot-date">Date</Label>
                <Input id="slot-date" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slot-time">Start time</Label>
                <Input id="slot-time" type="time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slot-duration">Duration (minutes)</Label>
                <Input id="slot-duration" type="number" min={15} max={180} step={15} value={form.duration} onChange={(event) => setForm({ ...form, duration: event.target.value })} required />
              </div>
              <Button className="w-full" disabled={isBusy}> {isBusy ? 'Saving...' : 'Create slot'} </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {slots.filter((slot) => slot.status !== 'CANCELLED').slice(0, 5).map((slot) => (
              <div key={slot.id} className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 p-3">
                <div>
                  <div className="font-medium text-stone-900">{formatDateTime(slot.startAt, 'EEE, d MMM')}</div>
                  <div className="text-sm text-stone-600">{formatTimeRange(slot.startAt, slot.endAt)} | {slot.status}</div>
                </div>
                <Button variant="outline" size="sm" onClick={() => cancelSlot(slot.id)}>Cancel</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Slots</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {slots.map((slot) => (
              <div key={slot.id} className="rounded-xl border border-stone-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-stone-900">{formatDateTime(slot.startAt, 'EEE, d MMM yyyy')}</div>
                    <div className="text-sm text-stone-600">{formatTimeRange(slot.startAt, slot.endAt)} • {slot.durationMinutes} min</div>
                  </div>
                  <Badge className={cn(slot.status === 'AVAILABLE' ? 'bg-emerald-100 text-emerald-900' : slot.status === 'BOOKED' ? 'bg-amber-100 text-amber-900' : 'bg-stone-200 text-stone-700')}>{slot.status}</Badge>
                </div>
                {slot.status !== 'BOOKED' ? (
                  <div className="mt-3 flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => cancelSlot(slot.id)}>Cancel slot</Button>
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bookings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {bookings.map((booking) => (
              <div key={booking.id} className="rounded-xl border border-stone-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-stone-900">{booking.visitorName}</div>
                    <div className="text-sm text-stone-600">{booking.visitorEmail}</div>
                  </div>
                  <Badge className={booking.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-900' : 'bg-stone-200 text-stone-700'}>{booking.status}</Badge>
                </div>
                {booking.note ? <p className="mt-2 text-sm text-stone-600">“{booking.note}”</p> : null}
                <div className="mt-3 flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => cancelBooking(booking.id)}>Cancel booking</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </main>
  )
}

export default App
