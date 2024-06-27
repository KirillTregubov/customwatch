import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import clsx from 'clsx'
import { AnimatePresence, motion, useAnimation } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  LoaderPinwheel,
  SettingsIcon
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react'
import { toast } from 'sonner'

import placeholder from '@/assets/placeholder.svg'
import Loading from '@/components/Loading'
import { MotionComponent, MotionLink } from '@/components/Motion'
import { fadeInVariants } from '@/lib/animations'
import {
  backgroundsQueryOptions,
  launchQueryOptions,
  useBackgroundMutation,
  useResetBackgroundMutation
} from '@/lib/data'
import type { Background } from '@/lib/schemas'
import useKeyPress from '@/lib/useKeyPress'
import { useDraggable } from 'react-use-draggable-scroll'

const buttonTapAnimation = {
  scale: 0.95
}

export const Route = createFileRoute('/menu')({
  loader: async ({ context: { queryClient } }) =>
    await queryClient.ensureQueryData(backgroundsQueryOptions),
  beforeLoad: async ({ context: { queryClient } }) => {
    const { is_setup, steam } = await queryClient
      .fetchQuery(launchQueryOptions)
      .catch(() => {
        throw redirect({ to: '/' })
      })

    if (!is_setup) {
      throw redirect({ to: '/setup' })
    }

    if (steam.enabled && !steam.setup) {
      throw redirect({ to: '/setup/steam_setup' })
    }
  },
  component: Menu,
  pendingComponent: Loading
})

const onImageError = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
  if (!event?.target) return
  ;(event.target as HTMLImageElement).src = placeholder
}

function Menu() {
  const { data: backgrounds } = useSuspenseQuery(backgroundsQueryOptions)
  const { data: config } = useSuspenseQuery(launchQueryOptions)
  const {
    status: setStatus,
    mutate: setBackground,
    reset: resetSetBackground
  } = useBackgroundMutation()
  const {
    status: resetStatus,
    mutate: resetBackground,
    reset
  } = useResetBackgroundMutation({
    onSuccess: () => resetSetBackground(),
    onSettled: () => reset()
  })
  const backgroundRefs = useRef<HTMLImageElement[]>([])
  const [activeBackground, setActiveBackground] = useState<Background | null>(
    backgrounds.length > 0 ? backgrounds[0]! : null
  )
  const draggableRef = useRef<HTMLDivElement>(
    null
  ) as React.MutableRefObject<HTMLDivElement>
  const { events } = useDraggable(draggableRef)
  const prevButtonRef = useRef<HTMLButtonElement>(null)
  const prevButtonAnimation = useAnimation()
  const nextButtonRef = useRef<HTMLButtonElement>(null)
  const nextButtonAnimation = useAnimation()
  useKeyPress({
    keys: ['ArrowLeft', 'a'],
    onPress: async (event) => {
      event.preventDefault()
      if (!prevButtonRef.current) return

      prevButtonRef.current.ariaPressed = 'true'
      await prevButtonAnimation.start(buttonTapAnimation)
      prevButtonRef.current?.click()
      prevButtonRef.current?.focus()
      prevButtonRef.current?.blur()
      prevButtonRef.current.ariaPressed = 'false'
      await prevButtonAnimation.start({ scale: 1 })
    },
    debounce: 100
  })
  useKeyPress({
    keys: ['ArrowRight', 'd'],
    onPress: async (event) => {
      event.preventDefault()
      if (!nextButtonRef.current) return

      nextButtonRef.current.ariaPressed = 'true'
      await nextButtonAnimation.start(buttonTapAnimation)
      nextButtonRef.current?.click()
      nextButtonRef.current?.focus()
      nextButtonRef.current?.blur()
      nextButtonRef.current.ariaPressed = 'false'
      await nextButtonAnimation.start({ scale: 1 })
    },
    debounce: 100
  })

  useEffect(() => {
    if (!config.background.is_outdated) return
    toast.error(
      'Your background is outdated. This may result in a black screen in game.',
      {
        id: 'reset-background',
        action: {
          label: 'Reset to Default',
          onClick: () => resetBackground()
        },
        duration: 5000
      }
    )
  }, [config.background.is_outdated, resetBackground])

  const handleSelect = useCallback(
    (index: number) => {
      const ref = backgroundRefs.current[index]
      if (!ref || (activeBackground && ref.id === activeBackground?.id)) return
      const background = backgrounds.at(index)
      if (!background) return

      setActiveBackground(background)
      resetSetBackground()
      ref.scrollIntoView({
        behavior: 'smooth',
        inline: 'center'
      })
    },
    [activeBackground, backgrounds, resetSetBackground]
  )

  useLayoutEffect(() => {
    // if (backgrounds.length < 1) {
    //   toast.error('No backgrounds found')
    //   return
    // }

    if (backgrounds.length < 1 || config.background.current === null) return
    // if (!activeBackground) setActiveBackground(backgrounds[0]!)
    const index = backgrounds.findIndex(
      (bg) => bg.id === config.background.current
    )
    if (index === -1) return
    // if (!activeBackground) setActiveBackground(backgrounds[0]!)

    handleSelect(index)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.background, backgrounds])

  const handleNavigate = useCallback(
    (direction: 'prev' | 'next') => {
      if (!activeBackground) return
      const currentIndex = backgrounds.findIndex(
        (bg) => bg.id === activeBackground.id
      )
      let newIndex

      if (direction === 'prev') {
        newIndex =
          currentIndex - 1 < 0 ? backgrounds.length - 1 : currentIndex - 1
      } else {
        newIndex = currentIndex + 1 >= backgrounds.length ? 0 : currentIndex + 1
      }

      handleSelect(newIndex)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeBackground, backgrounds]
  )

  return (
    <motion.div
      className="relative flex h-full w-full flex-col p-6 pt-0"
      variants={fadeInVariants}
      initial="hidden"
      animate="show"
    >
      <div className="relative">
        <div
          className="scrollbar-hide -mx-1 flex h-48 flex-shrink-0 cursor-grab items-center gap-3 overflow-x-auto px-12 before:pointer-events-none before:absolute before:-left-1 before:z-10 before:h-full before:w-6 before:content-[''] before:bg-easing-l-menu-top after:pointer-events-none after:absolute after:-right-1 after:z-10 after:h-full after:w-6 after:content-[''] after:bg-easing-r-menu-top first:pl-12 last:pr-12"
          // scroll-smooth
          {...events}
          ref={draggableRef}
        >
          {backgrounds.map((background, index) => (
            <motion.button
              key={background.id}
              onClick={() => handleSelect(index)}
              className={clsx(
                'aspect-video w-fit shadow-lg ring-offset-transparent transition-[width,height,box-shadow] will-change-transform focus-visible:outline-none',
                activeBackground?.id === background.id
                  ? 'highlight h-36 rounded-xl shadow-orange-600/15'
                  : 'highlight-base h-28 rounded-lg shadow-orange-600/10 hover:shadow-orange-600/15'
              )}
              initial={{ transform: 'scale(.9)' }}
              animate={{ transform: 'scale(1)' }}
              whileHover={{
                transform:
                  activeBackground?.id === background.id
                    ? 'scale(1)'
                    : 'scale(1.05)',
                transition: { duration: 0.2 }
              }}
              whileTap={{
                transform: 'scale(1)',
                transition: { duration: 0.2 }
              }}
              transition={{ duration: 0.3 }}
              tabIndex={-1}
            >
              <img
                id={background.id}
                alt={background.name}
                className={clsx(
                  'h-full w-full object-cover transition-[border-radius]',
                  activeBackground?.id === background.id
                    ? 'rounded-xl'
                    : 'rounded-lg'
                )}
                src={`/backgrounds/${background.image}`}
                ref={(el) => (backgroundRefs.current[index] = el!)}
                onError={onImageError}
                onDragStart={(e) => e.preventDefault()}
              />
              <div
                className={clsx(
                  'pointer-events-none absolute bottom-0 left-0 right-0 transform-gpu select-none truncate text-ellipsis bg-gradient-to-t from-zinc-950/50 to-transparent p-1 text-center font-bold text-white drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,0.8)] transition-[font-size,border-radius] will-change-transform',
                  activeBackground?.id === background.id
                    ? 'rounded-b-xl text-sm'
                    : 'rounded-b-lg py-1.5 text-xs'
                )}
              >
                {background.name}
              </div>
            </motion.button>
          ))}
        </div>
        <motion.div
          className="pointer-events-none absolute left-1 top-0 z-20 flex h-full items-center"
          initial={{ transform: 'translateX(15px)' }}
          animate={{ transform: 'translateX(0px)' }}
          transition={{ duration: 0.3 }}
        >
          <motion.button
            ref={prevButtonRef}
            className="pointer-events-auto rounded-full bg-zinc-800/70 p-1 backdrop-blur transition-colors hover:bg-zinc-700/70 focus-visible:bg-zinc-700/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white active:bg-zinc-600/70 aria-pressed:bg-zinc-600/70"
            onClick={() => handleNavigate('prev')}
            animate={prevButtonAnimation}
            initial={{ scale: 1 }}
            whileHover={{ scale: 1.1 }}
            whileFocus={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            transition={{ duration: 0.15 }}
          >
            <ChevronLeft size={24} className="text-white" />
          </motion.button>
        </motion.div>
        <motion.div
          className="pointer-events-none absolute right-1 top-0 z-20 flex h-full items-center"
          initial={{ transform: 'translateX(-15px)' }}
          animate={{ transform: 'translateX(0px)' }}
          transition={{ duration: 0.3 }}
        >
          <motion.button
            ref={nextButtonRef}
            className="pointer-events-auto rounded-full bg-zinc-800/70 p-1 backdrop-blur transition-colors hover:bg-zinc-700/70 focus-visible:bg-zinc-700/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white active:bg-zinc-600/70 aria-pressed:bg-zinc-600/70"
            onClick={() => handleNavigate('next')}
            initial={{ scale: 1 }}
            whileHover={{ scale: 1.1 }}
            whileFocus={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            transition={{ duration: 0.15 }}
            animate={nextButtonAnimation}
          >
            <ChevronRight size={24} className="text-white" />
          </motion.button>
        </motion.div>
      </div>
      <motion.div
        className="relative flex h-full min-h-0 w-full flex-1 justify-center"
        initial={{ transform: 'scale(.95)' }}
        whileInView={{ transform: 'scale(1)' }}
        transition={{ duration: 0.3 }}
      >
        <div className="absolute left-0 top-0 z-10 flex h-fit w-fit gap-2 p-3 text-sm">
          <AnimatePresence mode="wait" initial={false}>
            {activeBackground &&
              activeBackground.tags.map((tag) => (
                <motion.p
                  key={activeBackground.name + '-' + tag}
                  className="select-none rounded-md border border-zinc-800/80 bg-zinc-700/80 px-2 py-1 font-medium text-zinc-100 backdrop-blur will-change-transform"
                  initial={{ opacity: 0, transform: 'translateY(-4px)' }}
                  animate={{ opacity: 1, transform: 'translateY(0px)' }}
                  exit={{ opacity: 0, transform: 'translateY(-4px)' }}
                  transition={{ duration: 0.15, ease: 'easeInOut' }}
                >
                  {tag}
                </motion.p>
              ))}
          </AnimatePresence>
        </div>
        {/* NOTE: changeme */}
        {true && (
          <div className="absolute right-0 top-0 z-10 p-3">
            <MotionLink
              to="/settings"
              className="block rounded-full border-2 border-zinc-800/80 bg-zinc-700/80 text-zinc-100 ring-zinc-100 backdrop-blur transition-[border-color,box-shadow] hover:border-zinc-100 focus-visible:border-zinc-100 focus-visible:outline-none focus-visible:ring-1 active:border-zinc-100"
              variants={{
                initial: { scale: 1 },
                whileHover: { scale: 1.05 },
                whileFocus: { scale: 1.05 },
                whileTap: { scale: 0.95 }
              }}
              initial="initial"
              whileHover="whileHover"
              whileFocus="whileFocus"
              whileTap="whileTap"
              transition={{ duration: 0.15, ease: 'easeInOut' }}
              draggable={false}
            >
              <MotionComponent
                as={SettingsIcon}
                size={24}
                variants={{
                  initial: { rotate: 30 },
                  whileHover: { rotate: 390 },
                  whileFocus: { rotate: 390 }
                }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className="pointer-events-none box-content size-6 p-2"
                aria-label="Settings"
              />
            </MotionLink>
          </div>
        )}
        {activeBackground && (
          <img
            alt="Selected Wallpaper"
            className="z-0 h-full w-full rounded-lg object-cover shadow-lg"
            src={`/backgrounds/${activeBackground.image}`}
            onError={onImageError}
            onDragStart={(e) => e.preventDefault()}
          />
        )}
        {activeBackground && (
          <motion.div
            className="absolute bottom-0 z-10 flex w-full items-center gap-5 rounded-b-lg bg-zinc-950/50 p-4 pt-0 before:absolute before:-top-8 before:left-0 before:h-8 before:w-full before:content-[''] before:bg-easing-b-menu-bottom"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15, ease: 'easeInOut' }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${activeBackground.id}-description`}
                className="mr-auto flex select-none flex-col"
                initial={{ opacity: 0, transform: 'translateY(8px)' }}
                animate={{ opacity: 1, transform: 'translateY(0px)' }}
                transition={{ duration: 0.15, ease: 'easeInOut' }}
              >
                <h1 className="text-2xl font-bold">{activeBackground.name}</h1>
                <p className="text-lg">{activeBackground.description}</p>
              </motion.div>
            </AnimatePresence>

            {(config.background.is_outdated ||
              config.background.current !== null) && (
              <button
                className={clsx(
                  'relative h-14 w-48 select-none text-center text-lg font-medium uppercase tracking-wider transition-[color,transform] will-change-transform hover:text-zinc-300 focus-visible:text-zinc-300 focus-visible:outline-none active:scale-95 disabled:pointer-events-none',
                  resetStatus === 'idle' &&
                    'underline-fade-in after:bottom-4 after:left-3 after:right-3 after:w-[calc(100%-1.5rem)] after:bg-zinc-300'
                )}
                onClick={() => resetBackground()}
                disabled={resetStatus !== 'idle'}
              >
                <AnimatePresence mode="wait">
                  {resetStatus === 'pending' || resetStatus === 'success' ? (
                    <motion.span
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      key="pending"
                    >
                      <LoaderPinwheel className="mx-auto animate-spin" />
                    </motion.span>
                  ) : (
                    <motion.span
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      key="idle"
                    >
                      Reset to Default
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            )}
            {/* <button className="group rounded-full border-2 border-orange-900/50 bg-orange-950 p-3.5 text-orange-100 shadow-md ring-white transition-[border-color,transform,fill] will-change-transform hover:scale-105 hover:border-white focus-visible:scale-105 focus-visible:border-white focus-visible:outline-none focus-visible:ring-2 active:scale-95 active:border-orange-200 active:ring-orange-200">
            <HeartIcon
              size={24}
              className="fill-transparent transition-colors group-hover:fill-current group-focus-visible:fill-current group-active:fill-orange-200 group-active:stroke-orange-200"
            />
          </button> */}
            <button
              className={clsx(
                'h-14 w-40 select-none rounded-[0.2rem] border-2 border-orange-800/40 bg-orange-500 px-10 text-center text-lg font-medium uppercase tracking-wider text-orange-50 shadow-md ring-white transition-[border-color,transform,border-radius,box-shadow] will-change-transform hover:scale-105 hover:rounded-[0.25rem] hover:border-orange-50 focus-visible:scale-105 focus-visible:border-white focus-visible:outline-none focus-visible:ring-1 active:scale-95 disabled:pointer-events-none',
                setStatus === 'pending' && 'cursor-wait'
              )}
              onClick={() => {
                if (setStatus === 'pending') return
                setBackground({ id: activeBackground.id })
              }}
              disabled={
                config.background.current === activeBackground.id ||
                setStatus === 'success'
              }
              // key={`${activeBackground.id}-set`}
              key={
                config.background.current === activeBackground.id
                  ? 'current'
                  : 'not-current'
              }
            >
              <AnimatePresence mode="wait">
                {config.background.current === activeBackground.id ||
                setStatus === 'success' ? (
                  <motion.span
                    className="text-orange-100"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    key="success"
                  >
                    Applied
                  </motion.span>
                ) : setStatus === 'pending' ? (
                  <motion.span
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    key="pending"
                  >
                    <LoaderPinwheel className="mx-auto animate-spin text-orange-200" />
                  </motion.span>
                ) : (
                  <motion.span
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    key="idle"
                  >
                    Apply
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  )
}
