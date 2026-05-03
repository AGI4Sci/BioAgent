import json
import sys
import unittest
from pathlib import Path


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT))

from sciforge_vision_sense import (
    ComputerUseTextCommand,
    RunnerGroundingResult,
    RunnerVisionAction,
    RunnerVisionStepRecord,
    RunnerCompletionCheck,
    Point,
    build_sense_plugin_request,
    command_to_text,
    computer_use_command_from_action,
    sense_text_result_for_computer_use,
    text_signal_from_vision_step,
)


class ComputerUseTextSignalTest(unittest.TestCase):
    def test_sense_plugin_request_accepts_text_plus_modalities(self):
        request = build_sense_plugin_request(
            "Click the Upload button",
            modalities=[{"kind": "screenshot", "ref": "artifact:screen-001.png"}],
        )

        self.assertEqual(request.text, "Click the Upload button")
        self.assertEqual(request.modalities[0].kind, "screenshot")
        self.assertEqual(request.modalities[0].ref, "artifact:screen-001.png")
        self.assertEqual(request.targetUse, "computer-use")

    def test_computer_use_command_serializes_coordinates_as_text(self):
        action = RunnerVisionAction(kind="click", target_description="Upload button")
        grounding = RunnerGroundingResult(point=Point(682, 1101))

        command = computer_use_command_from_action(
            action,
            grounding=grounding,
            source_modality_refs=["artifact:screen-001.png"],
        )
        text = command_to_text(command)
        parsed = json.loads(text)

        self.assertEqual(parsed["action"], "click")
        self.assertEqual(parsed["target"]["description"], "Upload button")
        self.assertEqual(parsed["target"]["x"], 682)
        self.assertEqual(parsed["target"]["y"], 1101)
        self.assertEqual(parsed["sourceModalityRefs"], ["artifact:screen-001.png"])

    def test_high_risk_text_command_is_rejected_by_default(self):
        request = build_sense_plugin_request(
            "Click send and publish the post",
            modalities=[{"kind": "screenshot", "ref": "artifact:screen-002.png"}],
        )
        command = ComputerUseTextCommand(action="click", target={"description": "Send"})

        result = sense_text_result_for_computer_use(request, command)

        self.assertEqual(result.status, "rejected")
        self.assertIn("high-risk", result.reason)
        self.assertEqual(json.loads(result.text)["riskLevel"], "high")

    def test_vision_step_can_emit_plain_text_command(self):
        step = RunnerVisionStepRecord(
            index=0,
            before_screenshot_ref="artifact:before.png",
            screen_summary="Composer is visible.",
            visible_texts=[],
            completion_check=RunnerCompletionCheck(done=False),
            planned_action=RunnerVisionAction(kind="scroll", direction="down", amount=1),
        )

        text = text_signal_from_vision_step(step, output_format="text/x-computer-use-command")

        self.assertIn("scroll", text)
        self.assertIn("direction=down", text)
        self.assertIn("riskLevel=low", text)


if __name__ == "__main__":
    unittest.main()
