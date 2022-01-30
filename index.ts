import { Client, LogLevel } from "@notionhq/client"
import {
  PropertyValueTitle,
  PropertyValueMultiSelect,
  PropertyValueRichText,
  ExtractedPropertyValue
} from "@notion-stuff/v4-types"
import { config } from "dotenv"

// Define type myself
import { GetDatabaseResponse } from "@notionhq/client/build/src/api-endpoints";
type PropertyValueCheckBox = ExtractedPropertyValue<'checkbox'>;
type MultiSelectProperty = Extract<GetDatabaseResponse["properties"][string], { type: "multi_select" }>;

interface Setting {
  name: string
  enable: boolean
  pDbId: string
  pJoinKeyColumnName: string
  pRelationColumnName: string
  cDbId: string
  cJoinKeyColumnName: string
}

interface ParentPage {
  page_id: string
  relation_keys: RelationKey[]
}

interface RelationKey {
  key: string
  value: string | undefined
}

config()
const settingsDbId = process.env.SETTINGS_DB_ID as string

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
  // logLevel: LogLevel.DEBUG,
})

relateDb()

async function relateDb() {
  const settings = await init()
  for (const setting of settings) {
    if (!setting.enable) {
      console.log(`Name: ${setting.name} is skipped`)
      continue
    }

    console.log(`Name: ${setting.name} is start`)
    const parentPages = await getParentPages(setting.pDbId, setting.pJoinKeyColumnName)
    for (const parentPage of parentPages) {
      const childPageIds = await searchDbPageIds(setting.cDbId, parentPage)
      const updateRelationIds = []
      for (const childPageId of childPageIds) {
        updateRelationIds.push({ 'id': childPageId })
      }

      await updateRelation(parentPage.page_id, updateRelationIds, setting.pRelationColumnName)
    }
    console.log(`Name: ${setting.name} is end`)
  }
}

async function init(): Promise<Setting[]> {
  const settings: Setting[] = []
  const res = await notion.databases.query({
    database_id: settingsDbId,
  })
  // console.log(res)

  res.results.map(page => {
    // console.log(page.properties)
 
    const enable = page.properties['Enable'] as PropertyValueCheckBox
    const name = page.properties['Name'] as PropertyValueTitle
    const parentDbIdColumn = page.properties['Parent DB Id'] as PropertyValueRichText
    const parentJoinKeyColumn = page.properties['Parent JoinKey Column'] as PropertyValueRichText
    const childDb = page.properties['Child DB Id'] as PropertyValueRichText
    const childJoinKeyColumn = page.properties['Child JoinKey Column'] as PropertyValueRichText
    const relationColumn = page.properties['Relation Column'] as PropertyValueRichText

    settings.push({
      name: name.title.map(t => t.plain_text)[0],
      enable: enable.checkbox,
      pDbId: getPlainTextFirst(parentDbIdColumn),
      pJoinKeyColumnName: getPlainTextFirst(parentJoinKeyColumn),
      cDbId: getPlainTextFirst(childDb),
      cJoinKeyColumnName: getPlainTextFirst(childJoinKeyColumn),
      pRelationColumnName: getPlainTextFirst(relationColumn),
    })
  })

  // settings.map(e => console.log(e))
  return settings
}

function getPlainTextFirst(prop: PropertyValueRichText) {
  return prop.rich_text.map(e => e.plain_text)[0]
}

async function getParentPages(databaseId: string, columnName: string): Promise<ParentPage[]> {
  const res = await notion.databases.query({
    database_id: databaseId,
  })

  const pages:ParentPage[] = []
  const propertyNames = columnName.split(",")
  res.results.map(page => {
    const tmp: ParentPage = {
      page_id: page.id,
      relation_keys: []
    }
    Object.entries(page.properties).forEach(([name, property]) => {
      if (!propertyNames.includes(name)) {
        return
      }
      if (property.type === "multi_select") {
        const msProp = property as PropertyValueMultiSelect
        // multi-select but supports single select
        const val = msProp.multi_select.map(e => e.name)[0]
        tmp.relation_keys.push({key: name, value: val})
      } else if (property.type === "select") {
        const sProp = property as PropertyValueSelect
        // multi-select but supports single select
        const val = sProp.select?.name
        tmp.relation_keys.push({key: name, value: val})
      } else if (property.type === "title") {
        const tProp = property as PropertyValueTitle
        const val = tProp.title.map(t => t.plain_text)[0]
        tmp.relation_keys.push({key: name, value: val})
      }
    })
    pages.push(tmp)
  })
  // console.log(pages)

  return pages
}

async function searchDbPageIds(databaseId: string, parentPage:ParentPage) :Promise<string[]> {
  const filterCondition:any = []
  parentPage.relation_keys.map(rkey => filterCondition.push({
    property: rkey.key,
    multi_select: {
      contains: rkey.value
    }
  }))

  const res = await notion.databases.query({
    database_id: databaseId,
    filter: {
      and: filterCondition
    }
  })

  if (res.results == null) {
    return []
  }

  const pageIds: string[] = []
  res.results.map(page => {
    const name = page.properties.Name as PropertyValueTitle
    //console.log(`tag:${tag}, name:${name.title.map(t => t.plain_text)}, pageId:${page.id}`)
    pageIds.push(page.id)
  })
  // console.log(pages)

  return pageIds
}

// @ts-ignore
async function updateRelation(parentId: string, childIds: any[], relateColumnName: string) {
  // console.log(relateColumnName)
  await notion.pages.update({
    page_id: parentId,
    properties: {
      [relateColumnName]: {
        type: 'relation',
        'relation': childIds
      }
    }
  })
}

async function getDbMultiSelect(databaseId: string, column: string): Promise<string[]> {
  const res = await notion.databases.retrieve({
    database_id: databaseId,
  })
  // console.log(res.properties)
  const ms = res.properties[column] as MultiSelectProperty
  const multiSelectTags = ms.multi_select.options.map(o => o.name)
  // console.log(multiSelectTags)

  return multiSelectTags
}
