"use client"

import {
  Questionnaire,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireItem,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "@/components/ui/questionnaire"
import type { AskPlayerInput, AskPlayerOutput } from "@/lib/games/ask-player"

/** The form field name the single question's radios live under. */
const ITEM_NAME = "answer"

/**
 * The pending state of an `ask_player` tool call: one question, 2-4 options,
 * answered by a single click. Submitting hands `{ id, label }` back to the
 * chat thread, which supplies it as the tool's output (`addToolOutput`) and
 * resumes the agent's turn.
 */
export function ChatAskPlayer({
  input,
  busy,
  onAnswer,
}: {
  input: AskPlayerInput
  /** A turn is streaming — the pending question stays frozen until it settles. */
  busy: boolean
  onAnswer: (output: AskPlayerOutput) => void
}) {
  return (
    <Questionnaire
      onSubmit={(event) => {
        event.preventDefault()
        const chosen = new FormData(event.currentTarget).get(ITEM_NAME)
        const option = input.options.find(
          (candidate) => candidate.id === chosen
        )
        if (option) onAnswer({ id: option.id, label: option.label })
      }}
    >
      <QuestionnaireItem name={ITEM_NAME} required disabled={busy}>
        <QuestionnaireTitle>{input.question}</QuestionnaireTitle>
        <QuestionnaireDescription>
          Deciding: {input.dimension}
        </QuestionnaireDescription>
        <QuestionnaireChoices>
          {input.options.map((option) => (
            <QuestionnaireChoice key={option.id} value={option.id}>
              {/* Choice wraps its children in the primitive's label. */}
              {option.label}
              <QuestionnaireChoiceDescription>
                {option.description}
              </QuestionnaireChoiceDescription>
            </QuestionnaireChoice>
          ))}
        </QuestionnaireChoices>
        <QuestionnaireSubmit>Send answer</QuestionnaireSubmit>
      </QuestionnaireItem>
    </Questionnaire>
  )
}
