import { getCategories, SkillCategory } from '@anticrm/skillset'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { extractDocument } from './process'

// Retrieve PDF directory from command line arguments
const pdfDir = process.argv[2]

// Read PDF files from the specified directory
const files = readdirSync(pdfDir)

// Maps for storing skill counts and resume formats
const skills = new Map<string, { count: number, category?: SkillCategory }>()
const formats = new Map<string, number>()

// Ensure the root directory for processed resumes exists
const resumesRoot = './resumes'
if (!existsSync(resumesRoot)) {
  mkdirSync(resumesRoot, { recursive: true })
}

// Retrieve predefined skill categories
const categories = getCategories()

// Main function to process all files
async function readFiles(): Promise<void> {
  for (const filename of files) {
    await processFile(filename)
  }
  await saveSkillData()
  console.log('Formats:', Array.from(formats.entries()))
}

// Function to process each file
async function processFile(filename: string): Promise<void> {
  try {
    const pdfFile = join(pdfDir, filename)
    const data = readFileSync(pdfFile)

    const { resume, model } = await extractDocument(data)
    if (resume) {
      updateFormats(resume.format)
      console.log('Resume for', resume.format, resume.firstName, resume.lastName)

      if (resume.skills.length > 0) {
        updateSkills(resume.skills)
      }

      const resumePath = buildResumePath(resume)
      ensureDirExists(resumePath)

      await saveResumeData(resumePath, filename, resume, model, data)
    }
  } catch (err) {
    console.error(`Failed to process file: ${filename}`, err)
  }
}

// Update format counts
function updateFormats(format: string): void {
  formats.set(format, (formats.get(format) ?? 0) + 1)
}

// Update skill counts and categories
function updateSkills(skillList: string[]): void {
  for (const skill of skillList) {
    const skillEntry = skills.get(skill) ?? { count: 0, category: undefined }
    skillEntry.count++

    if (!skillEntry.category) {
      skillEntry.category = findSkillCategory(skill)
    }

    skills.set(skill, skillEntry)
  }
}

// Find skill category from predefined categories
function findSkillCategory(skill: string): SkillCategory | undefined {
  return categories.find((category) =>
    category.skills.some((s) => s.toLowerCase() === skill.toLowerCase())
  )
}

// Build path for saving resume data
function buildResumePath(resume: any): string {
  const pathParts = [resumesRoot, resume.format, resume.skills.length > 0 ? 'skills' : 'no-skills']
  return join(...pathParts)
}

// Ensure directory existence
function ensureDirExists(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true })
  }
}

// Save resume and model data to files
async function saveResumeData(
  dirPath: string,
  filename: string,
  resume: any,
  model: any,
  data: any
): Promise<void> {
  try {
    await Promise.all([
      writeFile(join(dirPath, filename), data),
      writeFile(join(dirPath, `${filename}.resume.json`), JSON.stringify(resume, null, 2)),
      ...model.images.map((img: any) =>
        writeFile(join(dirPath, `${filename}._${img.name}.png`), img.pngBuffer)
      ),
      writeFile(join(dirPath, `${filename}.model.json`), JSON.stringify(model, null, 2)),
    ])
    model.images = []
  } catch (err) {
    console.error(`Failed to save resume data for: ${filename}`, err)
  }
}

// Save skill data to files
async function saveSkillData(): Promise<void> {
  const filteredSkills = Array.from(skills.entries())
    .filter(([, value]) => value.count > 1)
    .map(([key]) => key)

  const rawSkills = Array.from(skills.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .map(([skill, { count, category }]) =>
      `${skill}-${count}-${category?.label ?? 'Unknown'}`
    )

  try {
    await Promise.all([
      writeFile('./skills.json', JSON.stringify(filteredSkills, null, 2)),
      writeFile('./skills_raw.json', JSON.stringify(rawSkills, null, 2)),
    ])
  } catch (err) {
    console.error('Failed to save skill data:', err)
  }
}

// Start processing files and handle any errors
readFiles().catch((err) => console.error('Unexpected error:', err))
