import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../services/api'

export function useAccount() {
  const [account, setAccount] = useState(undefined)

  useEffect(() => {
    let cancelled = false
    apiRequest('/api/auth/me')
      .then(({ user }) => {
        if (!cancelled) setAccount(user)
      })
      .catch(() => {
        if (!cancelled) setAccount(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const signUpForm = useCallback(async ({ name, email, password }) => {
    return await apiRequest('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    })
  }, [])

  const verifySignUpEmail = useCallback(async ({ email, code }) => {
    const { user } = await apiRequest('/api/auth/signup/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    })
    setAccount(user)
    return user
  }, [])

  const requestPasswordReset = useCallback(async (email) => {
    return await apiRequest('/api/auth/password-reset/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  }, [])

  const confirmPasswordReset = useCallback(async ({ email, code, password }) => {
    return await apiRequest('/api/auth/password-reset/confirm', {
      method: 'POST',
      body: JSON.stringify({ email, code, password }),
    })
  }, [])

  const signInForm = useCallback(async ({ email, password }) => {
    const { user } = await apiRequest('/api/auth/signin', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    setAccount(user)
    return user
  }, [])

  const signInWithGoogle = useCallback(async (payload) => {
    const { user } = await apiRequest('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    setAccount(user)
    return user
  }, [])

  const updateName = useCallback(async (name) => {
    const { user } = await apiRequest('/api/account/name', {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    })
    setAccount(user)
    return user
  }, [])

  const changePassword = useCallback(async ({ oldPassword, newPassword }) => {
    return await apiRequest('/api/account/password', {
      method: 'PATCH',
      body: JSON.stringify({ oldPassword, newPassword }),
    })
  }, [])

  const toggleAutoRenew = useCallback(async (autoRenew) => {
    const { user } = await apiRequest('/api/account/autorenew', {
      method: 'PATCH',
      body: JSON.stringify({ autoRenew }),
    })
    setAccount(user)
    return user
  }, [])

  const setPlan = useCallback(async (planId) => {
    const { user } = await apiRequest('/api/account/plan', {
      method: 'PATCH',
      body: JSON.stringify({ planId }),
    })
    setAccount(user)
    return user
  }, [])

  const deleteAccount = useCallback(async () => {
    const result = await apiRequest('/api/account/delete', {
      method: 'DELETE',
      body: JSON.stringify({ confirmation: 'DELETE' }),
    })
    setAccount(null)
    return result
  }, [])

  const signOut = useCallback(async () => {
    await apiRequest('/api/auth/signout', { method: 'POST' }).catch(() => {})
    setAccount(null)
  }, [])

  const fetchUsage = useCallback(() => apiRequest('/api/account/usage'), [])
  const fetchPlans = useCallback(() => apiRequest('/api/account/plans'), [])

  const refetchAccount = useCallback(async () => {
    try {
      const { user } = await apiRequest('/api/auth/me')
      if (user) setAccount(user)
      return user
    } catch {
      return null
    }
  }, [])

  return {
    account,
    signUpForm,
    verifySignUpEmail,
    requestPasswordReset,
    confirmPasswordReset,
    signInForm,
    signInWithGoogle,
    updateName,
    changePassword,
    toggleAutoRenew,
    setPlan,
    updateAccountUser: (user) => setAccount(user),
    deleteAccount,
    refetchAccount,
    signOut,
    fetchUsage,
    fetchPlans,
  }
}
