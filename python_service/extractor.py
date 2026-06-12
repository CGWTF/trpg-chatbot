import hashlib
import json
import os
import re


ENTITY_TYPES = {"person", "place", "organization"}
ENTITY_LIMITS = {"person": 12, "place": 24, "organization": 24}
INVALID_NAME_PARTS = {
    "你", "你们", "我", "我们", "他", "他们", "她", "她们", "它", "玩家", "众人",
    "进入", "抵达", "来到", "到达", "回到", "前往", "发现", "看见", "听见", "随后",
    "然后", "这里", "那里", "当前", "得知", "一个", "一名", "这位", "那位",
}
GENERIC_PERSON_ROLES = {
    "管家", "守卫", "卫兵", "士兵", "旅客", "旅人", "路人", "村民", "居民",
    "店主", "老板", "酒保", "侍者", "仆人", "女仆", "侍卫", "车夫", "船夫",
    "医生", "教授", "神父", "侦探", "警察", "队长", "商人", "女子", "男子",
    "老人", "少女", "少年", "孩子", "黑衣人", "陌生人", "蒙面人",
}
GENERIC_PERSON_PREFIXES = (
    "老", "年轻", "年迈", "神秘", "陌生", "受伤", "醉醺醺", "沉默",
    "一名", "一个", "那名", "这名", "那位", "这位",
)


def stable_id(entity_type: str, name: str) -> str:
    digest = hashlib.sha1(f"{entity_type}:{name}".encode("utf-8")).hexdigest()[:10]
    return f"{entity_type}_{digest}"


class KnowledgeExtractor:
    """Extracts entities and relations with an optional Transformers NER model."""

    def __init__(self):
        self.ner = None
        model_name = os.getenv("NLP_MODEL_NAME", "").strip()
        if model_name:
            try:
                from transformers import pipeline

                self.ner = pipeline(
                    "token-classification",
                    model=model_name,
                    aggregation_strategy="simple",
                )
            except ImportError:
                pass

    def extract(self, text: str) -> dict:
        structured = self._extract_structured(text)
        entities = structured["entities"]
        relations = structured["relations"]

        if self.ner:
            entities.extend(self._extract_with_model(text))

        entities.extend(self._extract_with_rules(text))
        entities = dedupe_entities(entities)
        relations.extend(self._extract_relations(text, entities))
        entity_names = {entity["name"] for entity in entities}
        relations = [
            relation for relation in relations
            if relation["source"] in entity_names and relation["target"] in entity_names
        ]
        return {
            "entities": entities,
            "relations": dedupe_relations(relations),
            "extractor": "transformers" if self.ner else "rules+structured",
        }

    def _extract_structured(self, text: str) -> dict:
        match = re.search(r"<TRPG_KNOWLEDGE>\s*([\s\S]*?)\s*</TRPG_KNOWLEDGE>", text, re.I)
        if not match:
            return {"entities": [], "relations": []}
        try:
            data = json.loads(match.group(1))
        except json.JSONDecodeError:
            return {"entities": [], "relations": []}

        entities = []
        for value in data.get("entities", []):
            name = str(value.get("name", "")).strip()[:80]
            entity_type = str(value.get("type", "")).lower()
            if entity_type in ENTITY_TYPES and is_valid_entity_name(name, entity_type):
                entities.append(make_entity(entity_type, name, value.get("description", "")))

        relations = []
        for value in data.get("relations", []):
            source = str(value.get("source", "")).strip()
            target = str(value.get("target", "")).strip()
            relation_type = str(value.get("type", "related_to")).strip()[:40]
            if source and target and source != target:
                relations.append(make_relation(source, target, relation_type, value.get("evidence", [])))
        return {"entities": entities, "relations": relations}

    def _extract_with_model(self, text: str) -> list:
        type_map = {
            "PER": "person", "PERSON": "person",
            "LOC": "place", "LOCATION": "place", "GPE": "place",
            "ORG": "organization", "ORGANIZATION": "organization",
        }
        entities = []
        for value in self.ner(text[:5000]):
            label = str(value.get("entity_group", "")).upper()
            entity_type = next((mapped for key, mapped in type_map.items() if key in label), None)
            name = str(value.get("word", "")).replace(" ", "").strip()
            if entity_type and is_valid_entity_name(name, entity_type):
                entities.append(make_entity(entity_type, name, confidence=value.get("score", 0.5)))
        return entities

    def _extract_with_rules(self, text: str) -> list:
        entities = []
        patterns = {
            "person": [
                r"\*\*(?:人物|角色|NPC)[：:]\s*([^*\n]{2,20})\*\*",
                r"([\u4e00-\u9fff]{1,6}(?:先生|女士|小姐|队长|管家|教授|医生|神父|侦探))",
                r"(?:^|\n)([\u4e00-\u9fff]{2,8})[：:](?=[“\"「『])",
            ],
            "place": [
                r"\*\*(?:当前位置|得知场所)[：:]\s*([^*\n]{2,30})\*\*",
                r"([\u4e00-\u9fff]{2,6}(?:庄园|宅邸|酒馆|旅店|教堂|医院|码头|港口|广场|街道|书房|密室|地下室|庭院|森林|墓地|遗迹|城堡|村庄|小镇))",
            ],
            "organization": [
                r"\*\*(?:组织|势力)[：:]\s*([^*\n]{2,30})\*\*",
                r"([\u4e00-\u9fff]{2,6}(?:公会|教团|协会|家族|商会|军团))",
            ],
        }
        for entity_type, type_patterns in patterns.items():
            for pattern in type_patterns:
                for match in re.finditer(pattern, text):
                    name = match.group(1).strip()
                    if is_valid_entity_name(name, entity_type):
                        entities.append(make_entity(entity_type, name, confidence=0.55))
        return entities

    def _extract_relations(self, text: str, entities: list) -> list:
        relations = []
        names = [entity["name"] for entity in entities]
        relation_patterns = [
            ("serves", r"{a}(?:效忠|服务于|听命于|为){b}"),
            ("member_of", r"{a}(?:属于|加入了|是){b}(?:的成员)?"),
            ("enemy_of", r"{a}(?:敌视|仇恨|追杀|背叛了){b}"),
            ("knows", r"{a}(?:认识|熟悉|见过){b}"),
            ("located_at", r"{a}(?:位于|身处|藏在|住在){b}"),
        ]
        for source in names:
            for target in names:
                if source == target:
                    continue
                for relation_type, template in relation_patterns:
                    pattern = template.format(a=re.escape(source), b=re.escape(target))
                    if re.search(pattern, text):
                        relations.append(make_relation(source, target, relation_type, [text[:160]]))
        return relations


def make_entity(entity_type: str, name: str, description="", confidence=1.0) -> dict:
    return {
        "id": stable_id(entity_type, name),
        "type": entity_type,
        "name": name,
        "description": str(description).strip()[:240],
        "confidence": round(float(confidence), 4),
    }


def is_valid_entity_name(name: str, entity_type: str) -> bool:
    value = str(name).strip()
    if not value or len(value) > ENTITY_LIMITS.get(entity_type, 24):
        return False
    if re.search(r"[\s，。！？；：、,.!?;:\"“”‘’（）()\[\]{}<>]", value):
        return False
    if value in INVALID_NAME_PARTS or any(value.startswith(part) for part in INVALID_NAME_PARTS):
        return False
    if re.search(r"(?:说道|表示|发现|看见|听见|走向|走进|打开|离开|似乎|可能|正在|已经|突然)", value):
        return False
    if entity_type == "person" and is_generic_person_label(value):
        return False
    return bool(re.search(r"[\u4e00-\u9fffA-Za-z]", value))


def is_generic_person_label(value: str) -> bool:
    if value in GENERIC_PERSON_ROLES:
        return True
    return any(
        value == f"{prefix}{role}"
        for prefix in GENERIC_PERSON_PREFIXES
        for role in GENERIC_PERSON_ROLES
    )


def make_relation(source: str, target: str, relation_type: str, evidence=None) -> dict:
    relation_id = stable_id("relation", f"{source}:{relation_type}:{target}")
    return {
        "id": relation_id,
        "source": source,
        "target": target,
        "type": relation_type,
        "evidence": list(evidence or [])[:10],
    }


def dedupe_entities(entities: list) -> list:
    output = {}
    for entity in entities:
        key = (entity["type"], entity["name"])
        current = output.get(key)
        if not current or entity.get("confidence", 0) > current.get("confidence", 0):
            output[key] = entity

    # 第二阶段：同名包含去重（"旧仓库"包含"仓库" → 保留长名）
    result = list(output.values())
    result.sort(key=lambda e: len(e["name"]), reverse=True)
    merged = []
    skip = set()
    for i, a in enumerate(result):
        if i in skip:
            continue
        for j, b in enumerate(result):
            if j <= i or j in skip:
                continue
            if a["type"] == b["type"] and (a["name"] in b["name"] or b["name"] in a["name"]):
                skip.add(j)
        merged.append(a)
    return merged


def dedupe_relations(relations: list) -> list:
    output = {}
    for relation in relations:
        key = (relation["source"], relation["target"], relation["type"])
        output[key] = relation
    return list(output.values())
