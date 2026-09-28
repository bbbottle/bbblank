export const Entry = () => {
  return (
    <main>
      <article>
        <p>Hi.</p>
        <p>Welcome to my site.</p>
      </article>
    </main>
  )
}

export const init = (root: any) => {
  root.render(<Entry />)
}
