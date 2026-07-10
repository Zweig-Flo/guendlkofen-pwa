import { useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

function AuthBar() {
  const { isLoading, isAuthenticated, user, loginWithRedirect, logout, getAccessTokenSilently } =
    useAuth0()
  const [apiResult, setApiResult] = useState(null)

  const callApi = async () => {
    try {
      const token = await getAccessTokenSilently()
      const res = await fetch(`${API_URL}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setApiResult(`${res.status}: ${await res.text()}`)
    } catch (err) {
      setApiResult(`Error: ${err.message}`)
    }
  }

  if (isLoading) {
    return <div className="auth-bar">Loading…</div>
  }

  if (!isAuthenticated) {
    return (
      <div className="auth-bar">
        <button type="button" onClick={() => loginWithRedirect()}>
          Log in
        </button>
      </div>
    )
  }

  return (
    <div className="auth-bar">
      <span>Logged in as {user?.name ?? user?.email}</span>
      <button type="button" onClick={callApi}>
        Call API /me
      </button>
      <button
        type="button"
        onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
      >
        Log out
      </button>
      {apiResult && <pre>{apiResult}</pre>}
    </div>
  )
}

export default AuthBar
