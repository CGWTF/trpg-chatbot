import unittest

from python_service.extractor import KnowledgeExtractor
from python_service.graph_analysis import analyze_graph, merge_graph


class KnowledgeServiceTests(unittest.TestCase):
    def test_structured_extraction_and_graph_analysis(self):
        extractor = KnowledgeExtractor()
        result = extractor.extract(
            '<TRPG_KNOWLEDGE>{"entities":[{"name":"林默","type":"person"},{"name":"黑石家族","type":"organization"}],'
            '"relations":[{"source":"林默","target":"黑石家族","type":"serves","evidence":["契约"]}]}</TRPG_KNOWLEDGE>'
        )
        graph = merge_graph({"entities": [], "relations": []}, result)
        analysis = analyze_graph(graph)
        self.assertEqual(len(graph["entities"]), 2)
        self.assertEqual(analysis["relationCount"], 1)

    def test_rule_extraction_does_not_treat_narration_as_entities(self):
        extractor = KnowledgeExtractor()
        result = extractor.extract(
            "你来到了一间昏暗的房间，随后发现桌上有封信。"
            "老管家说道：“这里不安全。”"
        )
        names = {entity["name"] for entity in result["entities"]}
        self.assertNotIn("一间昏暗的房间", names)
        self.assertNotIn("一间昏暗的房间，随后发现桌上有封信", names)
        self.assertNotIn("老管家", names)

    def test_keeps_named_people_and_rejects_unnamed_npcs(self):
        extractor = KnowledgeExtractor()
        result = extractor.extract(
            '<TRPG_KNOWLEDGE>{"entities":['
            '{"name":"林默","type":"person"},'
            '{"name":"林医生","type":"person"},'
            '{"name":"老管家","type":"person"},'
            '{"name":"神秘女子","type":"person"}]}</TRPG_KNOWLEDGE>'
        )
        names = {entity["name"] for entity in result["entities"]}
        self.assertEqual(names, {"林默", "林医生"})

    def test_structured_relations_require_known_entity_endpoints(self):
        extractor = KnowledgeExtractor()
        result = extractor.extract(
            '<TRPG_KNOWLEDGE>{"entities":[{"name":"林默","type":"person"}],'
            '"relations":[{"source":"林默","target":"凭空人物","type":"knows"}]}</TRPG_KNOWLEDGE>'
        )
        self.assertEqual(result["relations"], [])

    def test_events_are_authoritative_and_skip_rule_noise(self):
        extractor = KnowledgeExtractor()
        result = extractor.extract(
            '老管家说道：“欢迎。”'
            '<TRPG_EVENTS>{"entities":[{"name":"林默","type":"person","description":"庄园管家"},'
            '{"name":"黑石庄园","type":"place"}],'
            '"relations":[{"source":"林默","target":"黑石庄园","type":"works_at",'
            '"evidence":"林默负责庄园事务"}]}</TRPG_EVENTS>'
        )
        names = {entity["name"] for entity in result["entities"]}
        self.assertEqual(names, {"林默", "黑石庄园"})
        self.assertEqual(result["extractor"], "events")
        self.assertEqual(result["relations"][0]["evidence"], ["林默负责庄园事务"])

    def test_merge_graph_deduplicates_local_and_service_entities_by_name(self):
        graph = merge_graph(
            {"entities": [{"id": "local_person", "name": "林默", "type": "person"}], "relations": []},
            {"entities": [{"id": "service_person", "name": "林默", "type": "person", "description": "庄园管家"}], "relations": []},
        )
        self.assertEqual(len(graph["entities"]), 1)
        self.assertEqual(graph["entities"][0]["id"], "local_person")
        self.assertEqual(graph["entities"][0]["description"], "庄园管家")


if __name__ == "__main__":
    unittest.main()
