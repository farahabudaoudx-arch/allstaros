import Link from "next/link";
import { buttonClass } from "@/components/ui";

// "Back To Portal" returns with ?guide=visited, which unlocks the
// "I've read the guide" confirm button on licensing step 01.
function BackToPortal() {
  return (
    <Link href="/portal?guide=visited" className={buttonClass("secondary")}>
      ‹ Back To Portal
    </Link>
  );
}

export default function PortalGuidePage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <BackToPortal />

      <article className="mt-8 space-y-5">
        <header className="space-y-3 border-b border-hairline pb-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-mute">
            Licensing guide
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.025em] md:text-4xl">
            How To Pass Your Life Insurance Exam On The First Try
          </h1>
        </header>

        <p className="text-base leading-relaxed text-subtle">
          If you want to sell life insurance, you have to pass the licensing exam
          first. There&apos;s no way around it. Most people wanting to get their
          license feel a sense of anxiety around the exam because nobody likes
          having to study for an exam or having to take an exam.
        </p>
        <p className="text-base leading-relaxed text-subtle">
          The truth about the life insurance exam is that it&apos;s extremely easy
          if you view it as what it ACTUALLY is: Your licensing exam is not where
          you become great at selling life insurance, it&apos;s only where you get
          your license. That&apos;s it.
        </p>
        <p className="text-base leading-relaxed text-subtle">
          Once you accept that, you can stop treating the exam like a make-or-break
          event and start passing it the way thousands of agents already have, on
          the first try, in a matter of days.
        </p>
        <p className="text-base leading-relaxed text-subtle">
          This guide covers how to study for the life insurance exam, the mindset
          to bring into it, and a simple method that gets you licensed fast.
        </p>

        <h2 className="pt-4 text-xl font-semibold tracking-[-0.015em] text-ink">
          What the Life Insurance Exam Actually Tests And How Much Do You Need to
          Study?
        </h2>
        <p className="text-base leading-relaxed text-subtle">
          The exam gives you a baseline understanding of a few core things:
        </p>
        <ul className="list-disc space-y-2 pl-6 text-base leading-relaxed text-subtle">
          <li>How life insurance works</li>
          <li>
            The different types of products, like term, whole life, IULs,
            annuities, etc.
          </li>
          <li>Basic regulation, meaning what you can and can&apos;t legally do</li>
        </ul>
        <p className="text-base leading-relaxed text-subtle">
          That&apos;s useful foundational knowledge. But be aware that some of the
          material is dated, and a fair amount of it doesn&apos;t reflect how life
          insurance actually gets sold in the field today. You still have to learn
          it to pass. Just don&apos;t confuse passing the test with knowing how to
          do the job.
        </p>
        <p className="text-base leading-relaxed text-subtle">
          Over and over again, we see the same pattern with new people taking the
          exam. Someone gets serious about getting licensed and thinks it&apos;s
          going to be extremely difficult. They schedule the exam a month out, and
          spend every waking moment cramming. They make flashcards. They watch
          endless videos. They memorize every single fact and detail.
        </p>
        <p className="text-base leading-relaxed text-subtle">
          If that&apos;s truly what helps you, go for it…but we don&apos;t recommend
          you to do that because that level of effort isn&apos;t really necessary.
          Trying to master every detail of the industry before you&apos;ve sold a
          single policy is the fastest way to stall out and never get going.
        </p>

        <h2 className="pt-4 text-xl font-semibold tracking-[-0.015em] text-ink">
          So What Should You Actually Focus On?
        </h2>
        <p className="text-base leading-relaxed text-subtle">
          Passing the exam. Not becoming a life insurance expert.
        </p>
        <p className="text-base leading-relaxed text-subtle">
          You become an expert by selling 100 policies. You do not become an expert
          by studying for this test. The license is just the thing that lets you
          start. So treat it that way and stop trying to learn everything before
          you&apos;ve even sold anything. The agents who only know the basics but
          know how to sell will out-earn the agents who memorized every product,
          every table, and every underwriting rule. Every time.
        </p>

        <h2 className="pt-4 text-xl font-semibold tracking-[-0.015em] text-ink">
          How the Exam Is Built And Why It Trips People Up
        </h2>
        <p className="text-base leading-relaxed text-subtle">
          Once you understand how these exams are written, they get a lot easier.
        </p>
        <p className="text-base leading-relaxed text-subtle">
          The questions are designed to trick you. They&apos;ll word something so
          you miss what&apos;s actually being asked, or they&apos;ll dangle an
          answer that looks right but isn&apos;t. That&apos;s not an accident,
          that&apos;s the point. They want to make sure you understand the concept,
          not that you memorized a list of answers. So slow down and read the
          question. Once you&apos;re looking for the trick, you stop falling for it.
        </p>
        <p className="text-base leading-relaxed text-subtle">
          And here&apos;s the part nobody tells you. The practice questions inside
          your training portal are basically the same questions you&apos;ll see on
          exam day, or close enough that it doesn&apos;t matter. So if you can pass
          the practice exams, you can pass the real one.
        </p>

        <h2 className="pt-4 text-xl font-semibold tracking-[-0.015em] text-ink">
          How To Actually Study
        </h2>
        <p className="text-base leading-relaxed text-subtle">
          Here&apos;s what we recommend, step by step.
        </p>
        <ol className="list-decimal space-y-3 pl-6 text-base leading-relaxed text-subtle">
          <li>
            Go through the material once. Read each section one time. That&apos;s
            it. You&apos;re not memorizing it, you&apos;re just getting familiar
            with it.
          </li>
          <li>
            When something doesn&apos;t make sense, paste it into the AI and have it
            explain it simply. You&apos;re going to hit stuff that doesn&apos;t
            click, usually annuities, IULs, and telling the different product types
            apart. Don&apos;t sit there reading the same paragraph ten times. Copy
            it, drop it into your AI study buddy or the get help section in your
            portal, and ask it to break it down for you in plain English. Then move
            on.
          </li>
          <li>
            Take the section quiz until you&apos;re hitting at least 90%. At the end
            of each section there&apos;s a quiz. Take it. If you don&apos;t hit 90%,
            take it again. Keep going until you do, then move to the next section.
          </li>
          <li>
            Do the exact same thing on the full practice exams. After the sections
            come the practice exams. Same rule. Take them over and over until
            you&apos;re consistently at 90% or better.
          </li>
          <li>
            Only study the questions you keep getting wrong. This is the whole game.
            Every time you miss one, screenshot it or write it down. Then the only
            thing you study is that pile of questions you keep missing. Stop
            reviewing the stuff you already know. Drill your misses, retake the
            exam, and your score climbs fast.
          </li>
        </ol>
        <p className="text-base leading-relaxed text-subtle">
          Do that, run the practice exams enough times, and you&apos;ll walk in
          ready.
        </p>

        <h2 className="pt-4 text-xl font-semibold tracking-[-0.015em] text-ink">
          How Long This Should Take
        </h2>
        <p className="text-base leading-relaxed text-subtle">
          Less time than you think. We&apos;ve watched people get their login and
          pass two days later.
        </p>
        <p className="text-base leading-relaxed text-subtle">
          You don&apos;t need a month. A week at the most, and a lot of people get
          it done in two or three days.
        </p>
        <p className="text-base leading-relaxed text-subtle">
          If you&apos;ve got a job, kids, or a full plate, you might have to make
          time for it. Block out two hours at night, make some coffee, and grind
          through the practice exams. But it&apos;s not a month of your life.
          It&apos;s a few focused sessions.
        </p>

        <h2 className="pt-4 text-xl font-semibold tracking-[-0.015em] text-ink">
          What You Don&apos;t Need
        </h2>
        <ul className="list-disc space-y-2 pl-6 text-base leading-relaxed text-subtle">
          <li>Textbooks</li>
          <li>Extra books on life insurance</li>
          <li>YouTube videos</li>
          <li>Fancy flashcard systems or custom study apps</li>
        </ul>
        <p className="text-base leading-relaxed text-subtle">
          None of it. Just work the questions and get every practice exam to 90%.
        </p>

        <h2 className="pt-4 text-xl font-semibold tracking-[-0.015em] text-ink">
          Our Personal Recommendation
        </h2>
        <p className="text-base leading-relaxed text-subtle">
          Whatever amount of time you can block out for studying, an hour, two
          hours, three hours, six hours, the whole day, whatever it is, we recommend
          at bare minimum that you watch one case study every single day alongside
          your study time.
        </p>
        <p className="text-base leading-relaxed text-subtle">
          Here&apos;s why. Let&apos;s just face it, the exam is kind of boring. All
          of this material is kind of boring. We want to make sure you&apos;re still
          excited about this opportunity and that you can see what&apos;s on the
          other side of actually passing this exam.
        </p>
        <p className="text-base leading-relaxed text-subtle">
          You&apos;re going to hear stories from people who made massive career
          switches. People who got themselves out of debt. People who are making
          more money than they ever thought possible. People who are living out
          their dream of being a successful business owner, all by being a part of
          the industry that is known for producing more millionaires than any other
          industry in the world.
        </p>
        <p className="text-base leading-relaxed text-subtle">
          Watch one a day minimum, or watch them all at once. We just want you to be
          able to see what&apos;s possible for you.
        </p>

        <h2 className="pt-4 text-xl font-semibold tracking-[-0.015em] text-ink">
          Final Word
        </h2>
        <p className="text-base leading-relaxed text-subtle">
          When you sit down for the real thing, you&apos;re going to realize the
          practice was all you needed and that the questions look just like what you
          already drilled. So don&apos;t overthink it. Pass the exam, get your
          license, and go put your energy into the only thing that actually pays
          you: learning how to sell.
        </p>
        <p className="text-base leading-relaxed text-subtle">Godspeed.</p>
      </article>

      <div className="mt-10 border-t border-hairline pt-6">
        <BackToPortal />
      </div>
    </main>
  );
}
